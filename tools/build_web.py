import re, os, datetime

ROOT = '/scratch/work/app/assets'
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

# head tweaks FIRST, so they never touch the HTML strings inside the JS
html = html.replace('<title>Tractor ERP</title>', '<title>Tractor ERP — Web</title>')
html = html.replace('</head>', '<meta name="application-name" content="Tractor ERP">\n</head>')

# inline the stylesheet
css = open(os.path.join(ROOT, 'css/app.css'), encoding='utf-8').read()
html = re.sub(r'<link rel="stylesheet" href="css/app.css">',
              '<style>\n' + css + '\n</style>', html)

# inline every script, in order
def inline(m):
    path = os.path.join(ROOT, m.group(1))
    code = open(path, encoding='utf-8').read()
    if '</script' in code.lower():
        raise SystemExit('script tag inside ' + m.group(1))
    return '<script>\n/* ==== ' + m.group(1) + ' ==== */\n' + code + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

out = '/scratch/work/Tractor-ERP-Web.html'
open(out, 'w', encoding='utf-8').write(html)
print('written', out, len(html), 'bytes')
