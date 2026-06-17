CROSSCUT SEO PATCH

I made this as a safe patch instead of a blind full-file replacement, so your current design, admin panel, forms, images, and JS should stay untouched.

WHAT IT CHANGES
- Adds SEO title, description, canonical URL, Open Graph, Twitter card tags.
- Adds JSON-LD schema for Robin Mohan, CROSSCUT, website, and services.
- Adds a hidden SEO-friendly heading for crawlers without changing the hero design.
- Changes crawlable stat values from 0/0/0 to 10/2/98.
- Fixes “ibeas paint pro” to “Ibis Paint X”.
- Fixes “Cap Cut” to “CapCut”.
- Adds a short SEO summary section near the footer.
- Creates robots.txt and sitemap.xml.
- Adds Express routes for robots.txt and sitemap.xml.
- Creates backups: index.html.before-seo.bak and server.js.before-seo.bak.

HOW TO USE ON YOUR SERVER OR PC
1. Copy crosscut-seo-patch.py into the root of your repo, where index.html and server.js exist.
2. Run:
   python3 crosscut-seo-patch.py

3. Test:
   npm start

4. If everything is okay:
   git add index.html server.js robots.txt sitemap.xml
   git commit -m "Improve CrossCut SEO"
   git push origin main

5. On AWS:
   git pull origin main
   pm2 restart crosscut
   sudo nginx -t && sudo systemctl reload nginx

6. Check:
   curl https://crosscut.ddns.net/robots.txt
   curl https://crosscut.ddns.net/sitemap.xml

ROLLBACK
If anything looks wrong:
   cp index.html.before-seo.bak index.html
   cp server.js.before-seo.bak server.js
