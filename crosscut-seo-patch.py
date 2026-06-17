from pathlib import Path
from datetime import date
import re
import shutil

SITE_URL = "https://crosscut.ddns.net"
TODAY = date.today().isoformat()
ROOT = Path.cwd()

index_path = ROOT / "index.html"
server_path = ROOT / "server.js"


def backup(path: Path):
    if path.exists():
        bak = path.with_suffix(path.suffix + ".before-seo.bak")
        if not bak.exists():
            shutil.copy2(path, bak)
            print(f"Backup created: {bak.name}")


def upsert_head_pack(html: str) -> str:
    seo_pack = f'''\n<!-- CROSSCUT SEO PACK -->
<meta name="description" content="CROSSCUT is Robin Mohan's cinematic editing portfolio for short films, trailers, reels, color grading, VFX, posters, logo design, and brand visuals in India.">
<meta name="keywords" content="CrossCut, CROSSCUT, Robin Mohan, video editor, film editor, short film editor, trailer editor, reels editor, VFX artist, color grading, poster design, logo design, cinematic editor India, video editor Mumbai">
<meta name="author" content="Robin Mohan">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{SITE_URL}/">

<meta property="og:title" content="CROSSCUT | Cinematic Video Editor & Visual Storyteller">
<meta property="og:description" content="Short film editing, trailers, teasers, reels, VFX, posters, logos, color grading, and cinematic brand visuals by Robin Mohan.">
<meta property="og:url" content="{SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CROSSCUT">
<meta property="og:image" content="{SITE_URL}/logo.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="CROSSCUT | Video Editor & VFX Artist">
<meta name="twitter:description" content="Cinematic editing portfolio by Robin Mohan: short films, trailers, reels, VFX, posters, logos, and color grading.">
<meta name="twitter:image" content="{SITE_URL}/logo.png">

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@graph": [
    {{
      "@type": "Person",
      "@id": "{SITE_URL}/#robin",
      "name": "Robin Mohan",
      "alternateName": "CROSSCUT",
      "url": "{SITE_URL}/",
      "jobTitle": "Video Editor, VFX Artist, Director of Photography",
      "sameAs": ["https://www.instagram.com/crosscut0109/"],
      "knowsAbout": [
        "Video Editing",
        "Short Film Editing",
        "Trailer Editing",
        "Reels Editing",
        "VFX",
        "Color Grading",
        "Poster Design",
        "Logo Design",
        "Cinematic Storytelling"
      ]
    }},
    {{
      "@type": "Organization",
      "@id": "{SITE_URL}/#organization",
      "name": "CROSSCUT",
      "url": "{SITE_URL}/",
      "founder": {{ "@id": "{SITE_URL}/#robin" }},
      "description": "CROSSCUT is a cinematic video editing and visual storytelling portfolio by Robin Mohan.",
      "sameAs": ["https://www.instagram.com/crosscut0109/"]
    }},
    {{
      "@type": "WebSite",
      "@id": "{SITE_URL}/#website",
      "name": "CROSSCUT",
      "url": "{SITE_URL}/",
      "publisher": {{ "@id": "{SITE_URL}/#organization" }}
    }},
    {{
      "@type": "Service",
      "@id": "{SITE_URL}/#services",
      "name": "Video Editing, VFX and Creative Design Services",
      "provider": {{ "@id": "{SITE_URL}/#organization" }},
      "areaServed": "India",
      "serviceType": [
        "Short Film Editing",
        "Trailer Editing",
        "Reels Editing",
        "Color Grading",
        "VFX",
        "Movie Poster Design",
        "Logo Design"
      ],
      "url": "{SITE_URL}/#services"
    }}
  ]
}}
</script>
'''

    html = re.sub(
        r"<title>.*?</title>",
        "<title>CROSSCUT | Video Editor, VFX Artist & Film Editing Portfolio</title>",
        html,
        count=1,
        flags=re.I | re.S,
    )

    if "CROSSCUT SEO PACK" not in html:
        if "</title>" in html.lower():
            html = re.sub(r"</title>", "</title>" + seo_pack, html, count=1, flags=re.I)
        else:
            html = re.sub(r"<head[^>]*>", lambda m: m.group(0) + seo_pack, html, count=1, flags=re.I)

    return html


def upsert_css(html: str) -> str:
    css_pack = '''

/* CROSSCUT SEO ACCESSIBILITY PACK */
.sr-only{
  position:absolute!important;
  width:1px!important;
  height:1px!important;
  padding:0!important;
  margin:-1px!important;
  overflow:hidden!important;
  clip:rect(0,0,0,0)!important;
  white-space:nowrap!important;
  border:0!important;
}

.seo-summary{
  max-width:900px;
  margin:80px auto;
  padding:0 24px;
  color:rgba(255,255,255,.72);
  line-height:1.8;
  position:relative;
  z-index:10;
}

.seo-summary h2{
  font-family:'Cinzel',serif;
  font-size:1.35rem;
  letter-spacing:.08em;
  color:var(--cream, #f8f0df);
  margin-bottom:16px;
}

.seo-summary p{
  font-family:'Inter',sans-serif;
  font-size:.9rem;
  letter-spacing:.04em;
}
'''
    if "CROSSCUT SEO ACCESSIBILITY PACK" in html:
        return html
    if "</style>" in html.lower():
        return re.sub(r"</style>", css_pack + "\n</style>", html, count=1, flags=re.I)
    return re.sub(r"</head>", f"<style>{css_pack}</style>\n</head>", html, count=1, flags=re.I)


def patch_index():
    if not index_path.exists():
        raise FileNotFoundError("index.html not found. Run this script from your repo root.")

    backup(index_path)
    html = index_path.read_text(encoding="utf-8")
    html = upsert_head_pack(html)
    html = upsert_css(html)

    # Give Google/AI crawlers a clean descriptive heading without changing visual hero text.
    if "CROSSCUT Video Editor and Visual Storyteller" not in html:
        html = re.sub(
            r'(<h1\s+class=["\']hero-title["\'][^>]*>)',
            r'\1\n  <span class="sr-only">CROSSCUT Video Editor and Visual Storyteller, VFX Artist and Film Editor in India</span>',
            html,
            count=1,
            flags=re.I,
        )

    # Make the real HTML values final numbers, while keeping the existing count animation data attributes.
    replacements = {
        '<span class="count" data-t="10">0</span>+': '<span class="count" data-t="10">10</span>+',
        '<span class="count" data-t="2">0</span>+': '<span class="count" data-t="2">2</span>+',
        '<span class="count" data-t="98">0</span><span>%</span>': '<span class="count" data-t="98">98</span><span>%</span>',
        'Cap Cut': 'CapCut',
    }
    for old, new in replacements.items():
        html = html.replace(old, new)

    html = re.sub(r"ibeas\s+paint\s+pro", "Ibis Paint X", html, flags=re.I)

    seo_summary = '''
<section id="seo-summary" class="seo-summary" aria-label="About CROSSCUT creative editing portfolio">
  <h2>CROSSCUT Creative Editing Portfolio</h2>
  <p>
    CROSSCUT is the creative portfolio of Robin Mohan, a video editor, VFX artist, filmmaker, and visual designer based in India. Services include short film editing, trailer editing, teaser editing, Instagram reels, YouTube Shorts, color grading, sound design, motion graphics, movie posters, and logo design.
  </p>
</section>
'''
    if 'id="seo-summary"' not in html:
        if "<footer" in html.lower():
            html = re.sub(r"<footer", seo_summary + "\n<footer", html, count=1, flags=re.I)
        else:
            html = re.sub(r"</body>", seo_summary + "\n</body>", html, count=1, flags=re.I)

    index_path.write_text(html, encoding="utf-8")
    print("Patched index.html")


def patch_server():
    if not server_path.exists():
        print("server.js not found, skipped server route patch.")
        return

    backup(server_path)
    server = server_path.read_text(encoding="utf-8")
    if "CROSSCUT SEO ROUTES" in server:
        print("server.js already has SEO routes")
        return

    seo_routes = f'''

// ─────────────────────────────────────────
// CROSSCUT SEO ROUTES
// ─────────────────────────────────────────
app.get('/robots.txt', (req, res) => {{
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /

Sitemap: {SITE_URL}/sitemap.xml`);
}});

app.get('/sitemap.xml', (req, res) => {{
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>{SITE_URL}/</loc>
    <lastmod>{TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
}});
'''

    if "app.listen(PORT" in server:
        server = server.replace("app.listen(PORT", seo_routes + "\napp.listen(PORT", 1)
        server_path.write_text(server, encoding="utf-8")
        print("Patched server.js")
    else:
        print("Could not find app.listen(PORT). server.js left unchanged.")


def write_static_seo_files():
    (ROOT / "robots.txt").write_text(f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}/sitemap.xml
""", encoding="utf-8")

    (ROOT / "sitemap.xml").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>{SITE_URL}/</loc>
    <lastmod>{TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
""", encoding="utf-8")
    print("Created robots.txt and sitemap.xml")


if __name__ == "__main__":
    patch_index()
    patch_server()
    write_static_seo_files()
    print("\nDone. Test with: npm start")
