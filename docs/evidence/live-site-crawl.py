import re, json, sys, urllib.request, urllib.error, time, html
from html.parser import HTMLParser
UA="AblePointAudit/1.0 (non-destructive, read-only)"
base="https://ablepointaustralia.com.au"
sm=open("out_sitemap.xml.txt").read()
urls=re.findall(r"<loc>([^<]+)</loc>",sm)
urls=[u for u in urls if not re.search(r"\.(jpg|jpeg|png|webp|gif|svg)$",u,re.I)]
seen=[];[seen.append(u) for u in urls if u not in seen]
urls=seen
extra=[base+p for p in ["/referral/","/supported-independent-living/","/ndis-support-service-providers-dubbo/","/privacy-policy/","/contact-us/","/about-us/"]]
for e in extra:
    if e not in urls: urls.append(e)
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.h={"h1":[],"h2":[],"h3":[],"h4":[],"h5":[]}; s.cur=None; s.buf=""; s.title=""; s.meta={}; s.canon=None; s.links=[]; s.ld=0; s.imgs=0; s.noalt=0; s.text=[]; s.intitle=False; s.skip=0; s.forms=0; s.inputs=0
    def handle_starttag(s,t,a):
        a=dict(a)
        if t in s.h: s.cur=t; s.buf=""
        if t=="title": s.intitle=True
        if t in("script","style","noscript"): s.skip+=1
        if t=="meta":
            k=a.get("name") or a.get("property")
            if k: s.meta[k]=a.get("content","")
        if t=="link" and a.get("rel")=="canonical": s.canon=a.get("href")
        if t=="a" and a.get("href") is not None: s.links.append(a["href"])
        if t=="script" and a.get("type")=="application/ld+json": s.ld+=1
        if t=="img":
            s.imgs+=1
            if not a.get("alt"): s.noalt+=1
        if t=="form": s.forms+=1
        if t in("input","textarea","select") and a.get("type") not in("hidden","submit"): s.inputs+=1
    def handle_endtag(s,t):
        if t==s.cur: s.h[t].append(re.sub(r"\s+"," ",s.buf).strip()); s.cur=None
        if t=="title": s.intitle=False
        if t in("script","style","noscript"): s.skip-=1
    def handle_data(s,d):
        if s.intitle: s.title+=d
        if s.cur: s.buf+=d
        if not s.skip: s.text.append(d)
rows=[]
for u in urls:
    try:
        req=urllib.request.Request(u,headers={"User-Agent":UA})
        r=urllib.request.urlopen(req,timeout=25); body=r.read().decode("utf-8","ignore"); code=r.status; final=r.geturl()
    except urllib.error.HTTPError as e:
        code=e.code; body=e.read().decode("utf-8","ignore"); final=u
    except Exception as e:
        rows.append({"url":u,"err":str(e)}); continue
    p=P(); p.feed(body)
    txt=re.sub(r"\s+"," "," ".join(p.text))
    rows.append({"url":u,"final":final,"code":code,"title":html.unescape(p.title.strip()),"desc":p.meta.get("description",""),"robots":p.meta.get("robots",""),"canon":p.canon,
      "h1":p.h["h1"],"h2n":len(p.h["h2"]),"h3n":len(p.h["h3"]),"h4n":len(p.h["h4"]),"h5n":len(p.h["h5"]),"words":len(txt.split()),"ld":p.ld,"imgs":p.imgs,"noalt":p.noalt,"forms":p.forms,"inputs":p.inputs,
      "hashlinks":sum(1 for l in p.links if l.strip() in("#","")),"placeholder":bool(re.search(r"Street Name|621-254-2147|contact@support\.com|Opens in your application",body)),
      "approved":bool(re.search(r"approved NDIS",body,re.I)),"kw":p.meta.get("keywords","")[:80],"ogsite":p.meta.get("og:site_name",""),
      "body_has_gtm":("googletagmanager.com" in body),"ga":bool(re.search(r"G-[A-Z0-9]{6,}|UA-\d+",body)),"clarity":("clarity.ms" in body),"meta_pixel":("fbevents" in body or "fbq(" in body),"turnstile":("turnstile" in body.lower()),"wpver":(re.search(r'generator" content="(WordPress[^"]*)"',body) or [None,None])[1]})
    time.sleep(0.6)
json.dump(rows,open("crawl.json","w"),indent=1,ensure_ascii=False)
print(len(rows),"pages")
