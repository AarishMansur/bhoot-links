import { createServer, type Server } from "node:http";

/**
 * A tiny fake internet for `npm run demo`. Every host is *.bhoot.test and the
 * probe resolves them to 127.0.0.1 in MOCK mode. Each one acts out a way that
 * syllabus links die or get taken over.
 */

const page = (title: string, body: string, extraHead = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${extraHead}</head><body>${body}</body></html>`;

const PARKED_CSS = `<style>body{margin:0;font-family:Arial,sans-serif;background:#f4f4f4;color:#333}.bar{background:#1d3557;color:#fff;padding:14px 32px;font-size:14px}.box{max-width:720px;margin:48px auto;background:#fff;padding:40px;border-radius:6px;box-shadow:0 1px 4px #0002;text-align:center}h1{font-size:30px;margin:0 0 8px}h2{color:#e63946}.rs a{display:block;margin:8px auto;max-width:420px;padding:12px;background:#457b9d;color:#fff;text-decoration:none;border-radius:4px}</style>`;
const CASINO_CSS = `<style>body{margin:0;font-family:Verdana,sans-serif;background:radial-gradient(circle at 30% 20%,#5b1a8b,#16052b 70%);color:#fff;min-height:100vh}.top{display:flex;justify-content:space-between;padding:16px 32px;background:#0008}.logo{font-weight:bold;color:#ffd23f;font-size:22px}.hero{padding:56px 32px;text-align:center}h1{font-size:44px;color:#ffd23f;text-shadow:0 0 18px #ff9f1c;margin:0}.cta{display:inline-block;margin-top:24px;background:linear-gradient(#ffd23f,#ff9f1c);color:#3a0a00;padding:16px 40px;border-radius:40px;font-weight:bold;text-decoration:none;font-size:20px}.chips{margin-top:30px;font-size:15px;opacity:.85}</style>`;

const lorem = (topic: string) =>
  `<p>${topic} notes for second and third year B.Tech students. Each unit has worked examples, previous year questions and a short quiz at the end so you can test yourself before the sessional exam. Diagrams are drawn by hand and scanned, so they are easy to copy into your notebook.</p>`;

type Handler = (path: string) => { status: number; headers?: Record<string, string>; body?: string; hang?: boolean };

const SYLLABUS = `
<h1>B.Tech Computer Science and Engineering, Semester V (demo syllabus)</h1>
<p>Fictional syllabus used by the Bhoot Links demo. Every college and site below is made up.</p>
<h2>CS501 Database Management Systems</h2>
<ul>
  <li>Unit 1, ER model and relational algebra. Reference notes: <a href="http://dbms-tutorials.bhoot.test/er-model">DBMS Tutorials: ER model</a></li>
  <li>Unit 3, Normalization. Lecture videos: <a href="http://nptel-mirror.bhoot.test/course/dbms">NPTEL mirror DBMS course</a></li>
  <li>Lab manual: <a href="http://cs-dept.bhoot.test/old/dbms-lab-manual.pdf">Department DBMS lab manual (PDF)</a></li>
</ul>
<h2>CS502 Compiler Design</h2>
<ul>
  <li>Unit 2, Lexical analysis with Lex. Tutorial: <a href="http://compiler-notes.invalid/lex-yacc">Compiler notes: Lex and Yacc</a></li>
  <li>Unit 4, Syntax directed translation. Notes by Prof. Sharma: <a href="http://faculty.bhoot.test/~sharma/sdt-notes">SDT notes</a></li>
</ul>
<h2>CS503 Computer Networks</h2>
<ul>
  <li>Unit 1, OSI and TCP/IP. Animated lectures: <a href="http://cn-lectures.bhoot.test/osi">CN Lectures: OSI model</a></li>
  <li>Unit 5, Socket programming. Read: <a href="http://docs.bhoot.test/sockets">Socket programming guide</a></li>
  <li>Packet tracer labs: <a href="http://slow.bhoot.test/labs">Packet tracer lab sheets</a></li>
</ul>
<h2>CS504 Programming Lab (C and Python)</h2>
<ul>
  <li>C basics practice: <a href="http://learn-c-online.bhoot.test/pointers">Learn C Online: pointers</a></li>
  <li>Machine learning mini project starter: <a href="http://ml-course.bhoot.test/week1">ML course week 1</a></li>
  <li>Python reference: <a href="http://old-python-site.bhoot.test/tutorial">Python tutorial (old college mirror)</a></li>
  <li>Assignment upload portal: <a href="http://erp-portal.bhoot.test/assignments">College ERP assignments</a></li>
  <li>Internal question bank: <a href="http://private.bhoot.test/question-bank">Question bank (staff only)</a></li>
</ul>
<p>Also see www.dbms-tutorials.bhoot.test/normalization for extra problems.</p>
`;

const hosts: Record<string, Handler> = {
  "syllabus.bhoot.test": (p) =>
    p.startsWith("/btech-cse-sem5") ? { status: 200, body: page("B.Tech CSE Sem V Syllabus", SYLLABUS) } : { status: 404, body: "not found" },

  // alive
  "nptel-mirror.bhoot.test": () => ({ status: 200, body: page("DBMS | NPTEL mirror", `<h1>Database Management Systems</h1>${lorem("DBMS")}<ol><li>Week 1: ER model</li><li>Week 2: Relational algebra</li><li>Week 3: Normalization</li></ol>`) }),
  "docs.bhoot.test": () => ({ status: 200, body: page("Socket Programming Guide", `<h1>Socket programming in C</h1>${lorem("Socket programming")}<pre>int s = socket(AF_INET, SOCK_STREAM, 0);</pre>`) }),

  // dead: 404 and 410
  "cs-dept.bhoot.test": () => ({ status: 404, body: page("404 Not Found", "<h1>Not Found</h1><p>The requested URL was not found on this server.</p>") }),
  "faculty.bhoot.test": () => ({ status: 410, body: page("Gone", "<h1>Gone</h1><p>Faculty home pages were removed during the website migration.</p>") }),

  // dead: hangs until the probe times out
  "slow.bhoot.test": () => ({ status: 200, hang: true }),

  // dead: server error
  "erp-portal.bhoot.test": () => ({ status: 503, body: page("Service Unavailable", "<h1>503 Service Unavailable</h1>") }),

  // possessed: parked page you can see in the static HTML
  "dbms-tutorials.bhoot.test": () => ({
    status: 200,
    body: page(
      "dbms-tutorials.bhoot.test is for sale",
      `<div class="bar">dbms-tutorials.bhoot.test</div><div class="box"><h1>dbms-tutorials.bhoot.test</h1><h2>This domain is for sale!</h2><p>Make an offer on this domain today.</p><div class="rs"><p>Related searches:</p><a href="#">Online Degree</a><a href="#">Cheap Loans</a><a href="#">Free Movies</a></div></div><script>/* parking tracker */</script>`,
      PARKED_CSS,
    ),
  }),

  // possessed: parked page that only exists after JavaScript runs (why we need a real browser)
  "cn-lectures.bhoot.test": () => ({
    status: 200,
    body: page(
      "",
      `<div id="root"></div><script>setTimeout(function(){document.title='cn-lectures.bhoot.test';document.getElementById('root').innerHTML='<div class="bar">cn-lectures.bhoot.test</div><div class="box"><h1>cn-lectures.bhoot.test</h1><p>This domain may be for sale. Inquire about this domain.</p><div class="rs"><p>Related searches:</p><a href="#">Teen Patti real cash</a><a href="#">Online casino India</a></div></div>'},800)</script><script src="/parking.js"></script>`,
      PARKED_CSS,
    ),
  }),

  // possessed: lapsed domain bought by a betting site, in two languages
  "learn-c-online.bhoot.test": () => ({
    status: 200,
    body: page(
      "Lucky Teen Patti | India's No.1 Casino",
      `<div class="top"><span class="logo">♠ Lucky Teen Patti</span><span>Login | Register</span></div><div class="hero"><h1>Teen Patti Gold: 500% Welcome Bonus</h1><p>Play rummy, andar bahar and live casino. Instant UPI withdrawal.</p><p>अभी खेलें और जीतें! सट्टा मटका रिजल्ट सबसे पहले</p><a class="cta" href="/register">Register now</a><div class="chips">♣ Rummy ♦ Andar Bahar ♥ Live Casino ♠ Satta Matka</div></div>`,
      CASINO_CSS,
    ),
  }),

  // possessed: redirects off-domain into a casino
  "ml-course.bhoot.test": () => ({ status: 302, headers: { location: "http://lucky-spin.bhoot.test/welcome?ref=mlcourse" } }),
  "lucky-spin.bhoot.test": () => ({
    status: 200,
    body: page("Lucky Spin Casino", `<div id="app"></div><script>document.getElementById('app').innerHTML='<div class="top"><span class="logo">🎰 Lucky Spin</span><span>Deposit | Withdraw</span></div><div class="hero"><h1>Claim 100 free spins</h1><p>Aviator game, slots and IPL betting with deposit bonus.</p><a class="cta" href="#">Spin now</a></div>'</script><script src="/t.js"></script><script src="/u.js"></script>`, CASINO_CSS),
  }),

  // benign off-domain redirect: the college moved its mirror to a new domain
  "old-python-site.bhoot.test": () => ({ status: 301, headers: { location: "http://python-mirror.bhoot.test/tutorial/" } }),
  "python-mirror.bhoot.test": () => ({ status: 200, body: page("The Python Tutorial (mirror)", `<div style="font-family:Georgia,serif;max-width:760px;margin:40px auto;line-height:1.6"><h1>The Python Tutorial</h1>${lorem("Python")}<p>Chapters: data structures, modules, input and output, classes.</p></div>`) }),

  // robots.txt says no: we do not fetch it
  "private.bhoot.test": () => ({ status: 200, body: page("Question bank", "<p>staff only</p>") }),
};

export function startFixtureServer(port = Number(process.env.FIXTURE_PORT ?? 4747)): Promise<Server> {
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0].toLowerCase().replace(/^www\./, "");
    const path = req.url ?? "/";
    if (path === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(host === "private.bhoot.test" ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nDisallow:\n");
      return;
    }
    const h = hosts[host];
    if (!h) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("unknown fixture host");
      return;
    }
    const r = h(path);
    if (r.hang) return; // never answer, the probe should give up
    res.writeHead(r.status, { "content-type": "text/html; charset=utf-8", ...(r.headers ?? {}) });
    res.end(r.body ?? "");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

export const FIXTURE_HOSTS = Object.keys(hosts);

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  startFixtureServer().then(() => console.log("fixture server on http://127.0.0.1:" + (process.env.FIXTURE_PORT ?? 4747)));
}
