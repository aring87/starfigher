using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Windows.Forms;
using System.Drawing;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Standalone Windows playtest host. Content is embedded; only loopback is served.
internal static class Playtest {
    internal const string Build = "v157";
    internal const int Port = 18765;
    internal static readonly string SessionKey = Guid.NewGuid().ToString("N");
    internal static string Url { get { return "http://127.0.0.1:" + Port + "/?build=" + Build + "&hostKey=" + SessionKey; } }
    internal static string DataRoot, ContentRoot, PayloadHash;
    internal static LocalServer Server;
    static string Arg(string[] args, string name) { int at=Array.IndexOf(args,name); return at>=0 && at+1<args.Length ? args[at+1] : null; }
    internal static string Hash(Stream stream) { using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant(); }
    [STAThread] static int Main(string[] args) {
        DataRoot=Path.GetFullPath(Arg(args,"--data-root") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"StarfighterLastSignal","Playtest"));
        bool self=Array.IndexOf(args,"--self-test")>=0, serve=Array.IndexOf(args,"--serve-only")>=0;
        try {
            if(self || serve) {
                Prepare(); Server=new LocalServer(ContentRoot,Port); Server.Start();
                if(self) { SelfTest(); Server.Stop(); return 0; }
                File.WriteAllText(Path.Combine(DataRoot,"server-ready.json"),new JavaScriptSerializer().Serialize(new { url=Url,content=ContentRoot,pid=Process.GetCurrentProcess().Id,build=Build }));
                while(true) Thread.Sleep(1000);
            }
            bool first;
            using(var mutex=new Mutex(true,"Local\\StarfighterLastSignalPlaytest",out first)) {
                if(!first) { MessageBox.Show("Starfighter is already running. Open its game window or use the Starfighter tray icon.","Starfighter: Last Signal"); return 0; }
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new LaunchWindow());
            }
            return 0;
        } catch(Exception e) {
            Directory.CreateDirectory(DataRoot); File.WriteAllText(Path.Combine(DataRoot,"launcher-error.txt"),e.ToString());
            if(!self && !serve) MessageBox.Show(e.Message+"\n\nDetails: "+Path.Combine(DataRoot,"launcher-error.txt"),"Starfighter could not start",MessageBoxButtons.OK,MessageBoxIcon.Error);
            return 1;
        } finally { if(Server!=null)Server.Stop(); }
    }
    internal static void Prepare() {
        Directory.CreateDirectory(DataRoot);
        using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("Starfighter.Content.zip")) { if(stream==null)throw new Exception("Embedded game content is missing."); PayloadHash=Hash(stream); }
        ContentRoot=Path.Combine(DataRoot,"Content",Build+"-"+PayloadHash.Substring(0,12));
        string marker=Path.Combine(ContentRoot,".complete");
        if(!File.Exists(marker) || File.ReadAllText(marker)!=PayloadHash) {
            Directory.CreateDirectory(ContentRoot);
            using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("Starfighter.Content.zip"))
            using(var archive=new ZipArchive(stream,ZipArchiveMode.Read)) {
                string prefix=Path.GetFullPath(ContentRoot)+Path.DirectorySeparatorChar;
                foreach(var entry in archive.Entries) {
                    string target=Path.GetFullPath(Path.Combine(ContentRoot,entry.FullName.Replace('/',Path.DirectorySeparatorChar)));
                    if(!target.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid content archive path.");
                    if(String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    using(var input=entry.Open())using(var output=File.Create(target)) input.CopyTo(output);
                }
            }
            File.WriteAllText(marker,PayloadHash);
        }
    }
    internal static string Browser() {
        foreach(var folder in new [] {Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}) {
            foreach(var name in new [] {"Microsoft\\Edge\\Application\\msedge.exe","Google\\Chrome\\Application\\chrome.exe"}) { var p=Path.Combine(folder,name);if(File.Exists(p))return p; }
        }
        throw new Exception("Microsoft Edge or Google Chrome is needed to display this playtest. Windows 10/11 normally includes Edge.");
    }
    internal static Process OpenGame() {
        string profile=Path.Combine(DataRoot,"Browser"); Directory.CreateDirectory(profile);
        return Process.Start(new ProcessStartInfo(Browser(),"--no-first-run --no-default-browser-check --disable-background-mode --autoplay-policy=no-user-gesture-required --user-data-dir=\""+profile+"\" --app=\""+Url+"\"") {UseShellExecute=false});
    }
    static void SelfTest() {
        var json=new JavaScriptSerializer();
        var manifest=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(Path.Combine(ContentRoot,"content-manifest.json")));
        int checkedFiles=0;
        foreach(var row in manifest) { using(var input=File.OpenRead(Path.Combine(ContentRoot,row.Key.Replace('/',Path.DirectorySeparatorChar)))) if(Hash(input)!=row.Value)throw new Exception("Content verification failed: "+row.Key); checkedFiles++; }
        using(var web=new WebClient()) {
            if(!web.DownloadString(Url).Contains("Starfighter: Last Signal"))throw new Exception("Game entry failed.");
            if(!web.DownloadString("http://127.0.0.1:"+Port+"/flight-school.html?course=intro").Contains("flight-school-boot.js"))throw new Exception("Intro entry failed.");
        }
        var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+Port+"/music/menu-intro.mp3");request.AddRange(0,63);
        using(var response=(HttpWebResponse)request.GetResponse()) { if((int)response.StatusCode!=206 || response.ContentLength!=64)throw new Exception("Audio range request failed."); }
        var head=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+Port+"/index.html");head.Method="HEAD";
        using(var response=(HttpWebResponse)head.GetResponse())if(response.ContentLength<1000)throw new Exception("HEAD response failed.");
        string raw;
        using(var client=new TcpClient("127.0.0.1",Port)) { var stream=client.GetStream();byte[] data=Encoding.ASCII.GetBytes("GET /%2e%2e/launcher-error.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");stream.Write(data,0,data.Length);using(var reader=new StreamReader(stream))raw=reader.ReadToEnd(); }
        if(!raw.StartsWith("HTTP/1.1 403"))throw new Exception("Content path guard failed.");
        using(var web=new WebClient()) {web.UploadData("http://127.0.0.1:"+Port+"/__playtest/"+SessionKey+"/close","POST",new byte[0]);if(!Server.CloseAt.HasValue)throw new Exception("Page-close signal failed.");web.UploadData("http://127.0.0.1:"+Port+"/__playtest/"+SessionKey+"/ping","POST",new byte[0]);if(Server.CloseAt.HasValue)throw new Exception("Reload did not cancel page-close signal.");}
        File.WriteAllText(Path.Combine(DataRoot,"self-test.json"),json.Serialize(new {build=Build,passed=true,files=checkedFiles,payloadSha256=PayloadHash,tests=new [] {"all content hashes","game entry","intro entry","audio byte ranges","HEAD","path traversal rejected","authenticated page close and reload"},browser=Browser(),url=Url}));
    }
}

internal sealed class LaunchWindow : Form {
    readonly Label label=new Label(); readonly NotifyIcon tray=new NotifyIcon(); readonly System.Windows.Forms.Timer lifetime=new System.Windows.Forms.Timer(); Process browser;
    internal LaunchWindow() {
        Text="Starfighter: Last Signal — Playtest";ClientSize=new Size(440,135);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        BackColor=Color.FromArgb(6,15,27);ForeColor=Color.FromArgb(193,238,247);
        label.Dock=DockStyle.Fill;label.TextAlign=ContentAlignment.MiddleCenter;label.Text="STARFIGHTER: LAST SIGNAL\nPreparing offline playtest v157…";Controls.Add(label);
        tray.Text="Starfighter: Last Signal";tray.Icon=SystemIcons.Application;var menu=new ContextMenuStrip();menu.Items.Add("Open game",null,(s,e)=>Playtest.OpenGame());menu.Items.Add("Quit game",null,(s,e)=>Close());tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>Playtest.OpenGame();
        Shown+=(s,e)=>ThreadPool.QueueUserWorkItem(_=> {
            try { Playtest.Prepare();Playtest.Server=new LocalServer(Playtest.ContentRoot,Playtest.Port);Playtest.Server.Start();File.WriteAllText(Path.Combine(Playtest.DataRoot,"server-ready.json"),new JavaScriptSerializer().Serialize(new {url=Playtest.Url,pid=Process.GetCurrentProcess().Id,build=Playtest.Build}));browser=Playtest.OpenGame();BeginInvoke((Action)(()=>{tray.Visible=true;Hide();})); }
            catch(Exception error) { try{BeginInvoke((Action)(()=>{MessageBox.Show(error.Message,"Starfighter could not start",MessageBoxButtons.OK,MessageBoxIcon.Error);Close();}));}catch{} }
        });
        lifetime.Interval=1000;lifetime.Tick+=(s,e)=>{var closed=Playtest.Server==null?(DateTime?)null:Playtest.Server.CloseAt;if(closed.HasValue&&(DateTime.UtcNow-closed.Value).TotalSeconds>5)Close();};lifetime.Start();
        FormClosed+=(s,e)=>{lifetime.Stop();lifetime.Dispose();tray.Visible=false;tray.Dispose();if(Playtest.Server!=null)Playtest.Server.Stop();if(browser!=null&&!browser.HasExited)try{browser.CloseMainWindow();}catch{}};
    }
}

internal sealed class LocalServer {
    long closeTicks;
    internal DateTime? CloseAt { get {long value=Interlocked.Read(ref closeTicks);return value==0?(DateTime?)null:new DateTime(value,DateTimeKind.Utc);} }
    readonly string root; readonly TcpListener listener; readonly SemaphoreSlim slots=new SemaphoreSlim(32); volatile bool running;
    internal LocalServer(string content,int port) {root=Path.GetFullPath(content)+Path.DirectorySeparatorChar;listener=new TcpListener(IPAddress.Loopback,port);}
    internal void Start() { try{listener.Start();}catch(SocketException){throw new Exception("The game's local port "+Playtest.Port+" is busy. Close another Starfighter playtest and try again.");}running=true;new Thread(Accept){IsBackground=true}.Start(); }
    internal void Stop() {running=false;try{listener.Stop();}catch{}}
    void Accept() {while(running)try{var client=listener.AcceptTcpClient();if(!slots.Wait(0)){client.Close();continue;}ThreadPool.QueueUserWorkItem(_=>{try{Serve(client);}catch{}finally{client.Close();slots.Release();}});}catch{if(!running)return;}}
    static void Reply(Stream output,int code,string reason,long length,string type,string extra="") {byte[] data=Encoding.ASCII.GetBytes("HTTP/1.1 "+code+" "+reason+"\r\nContent-Length: "+length+"\r\nContent-Type: "+type+"\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nAccept-Ranges: bytes\r\nCache-Control: no-cache\r\n"+extra+"\r\n");output.Write(data,0,data.Length);}
    void Serve(TcpClient client) {
        client.ReceiveTimeout=5000;client.SendTimeout=30000;var stream=client.GetStream();var buffer=new List<byte>();int value;
        while(buffer.Count<16384&&(value=stream.ReadByte())>=0){buffer.Add((byte)value);int n=buffer.Count;if(n>=4&&buffer[n-4]==13&&buffer[n-3]==10&&buffer[n-2]==13&&buffer[n-1]==10)break;}
        string[] lines=Encoding.ASCII.GetString(buffer.ToArray()).Split(new [] {"\r\n"},StringSplitOptions.None);if(lines.Length==0)return;string[] first=lines[0].Split(' ');
        if(first.Length!=3){Reply(stream,400,"Bad Request",0,"text/plain");return;}
        string hostPath="/__playtest/"+Playtest.SessionKey+"/";
        if(first[0]=="POST"&&(first[1]==hostPath+"ping"||first[1]==hostPath+"close")){Interlocked.Exchange(ref closeTicks,first[1].EndsWith("/close")?DateTime.UtcNow.Ticks:0);Reply(stream,200,"OK",0,"text/plain");return;}
        bool head=first[0]=="HEAD";if(first[0]!="GET"&&!head){Reply(stream,405,"Method Not Allowed",0,"text/plain");return;}
        string requested;try{requested=Uri.UnescapeDataString(first[1].Split('?')[0]);}catch{Reply(stream,400,"Bad Request",0,"text/plain");return;}
        if(requested=="/")requested="/index.html";string path;
        try {path=Path.GetFullPath(Path.Combine(root,requested.TrimStart('/').Replace('/',Path.DirectorySeparatorChar)));}catch{Reply(stream,403,"Forbidden",0,"text/plain");return;}
        if(!path.StartsWith(root,StringComparison.OrdinalIgnoreCase)){Reply(stream,403,"Forbidden",0,"text/plain");return;}
        if(!File.Exists(path)){Reply(stream,404,"Not Found",0,"text/plain");return;}
        var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(var line in lines){int colon=line.IndexOf(':');if(colon>0)headers[line.Substring(0,colon)]=line.Substring(colon+1).Trim();}
        var info=new FileInfo(path);long length=info.Length,start=0,end=length-1;string etag="\""+length.ToString("x")+"-"+info.LastWriteTimeUtc.Ticks.ToString("x")+"\"";
        string type=Mime(Path.GetExtension(path));bool partial=false;string range;
        if(headers.TryGetValue("Range",out range)) {
            string[] pair=range.StartsWith("bytes=")?range.Substring(6).Split('-'):new string[0];long a,b;
            if(pair.Length!=2 || range.Contains(",") || (pair[0].Length==0 ? !Int64.TryParse(pair[1],out b) : !Int64.TryParse(pair[0],out a))) {Reply(stream,416,"Range Not Satisfiable",0,type,"Content-Range: bytes */"+length+"\r\n");return;}
            if(pair[0].Length==0){Int64.TryParse(pair[1],out b);start=Math.Max(0,length-b);}else{Int64.TryParse(pair[0],out a);start=a;if(pair[1].Length>0){if(!Int64.TryParse(pair[1],out b)){Reply(stream,416,"Range Not Satisfiable",0,type);return;}end=Math.Min(b,end);}}
            if(start<0||start>end||start>=length){Reply(stream,416,"Range Not Satisfiable",0,type,"Content-Range: bytes */"+length+"\r\n");return;}partial=true;
        } else {string match;if(headers.TryGetValue("If-None-Match",out match)&&match==etag){Reply(stream,304,"Not Modified",0,type,"ETag: "+etag+"\r\n");return;}}
        string extra="ETag: "+etag+"\r\n"+(partial?"Content-Range: bytes "+start+"-"+end+"/"+length+"\r\n":"");long count=end-start+1;Reply(stream,partial?206:200,partial?"Partial Content":"OK",count,type,extra);if(head)return;
        using(var file=File.OpenRead(path)){file.Position=start;byte[] chunk=new byte[65536];while(count>0){int read=file.Read(chunk,0,(int)Math.Min(chunk.Length,count));if(read==0)break;stream.Write(chunk,0,read);count-=read;}}
    }
    static string Mime(string ext) {switch(ext.ToLowerInvariant()){case ".html":return "text/html; charset=utf-8";case ".js":return "application/javascript; charset=utf-8";case ".css":return "text/css; charset=utf-8";case ".png":return "image/png";case ".jpg":return "image/jpeg";case ".svg":return "image/svg+xml";case ".mp3":return "audio/mpeg";case ".wav":return "audio/wav";case ".ttf":return "font/ttf";case ".woff2":return "font/woff2";case ".json":return "application/json";case ".txt":return "text/plain; charset=utf-8";default:return "application/octet-stream";}}
}
