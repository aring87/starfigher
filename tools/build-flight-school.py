from pathlib import Path
root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text(encoding='utf-8')
html=html.replace('<title>Starfighter: Last Signal</title>','<title>Flight School · Starfighter: Last Signal</title>',1)
html=html.replace('<body>','<body>\n  <script src="flight-school-boot.js?v=168"></script>',1)
(root/'flight-school.html').write_text(html,encoding='utf-8')
print('Built Flight School with temporary practice storage before game startup.')
