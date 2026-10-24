// A synthetic LinkedIn export with fake people. Shapes follow LinkedIn's CSV headers. Includes the awkward cases:
// a BOM, CRLF, quoted commas and newlines, "" escapes, the Connections "Notes:" preamble, HTML/script in fields,
// an address and birth date that must be dropped, and a javascript: URL that must not survive.
export const files = {
  'Profile.csv': '﻿First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers\r\n'
    + 'Ada,Testwright,,"1 Fake Street, Nowhere",Jan 1 1990,"Engineer, writer & <b>builder</b>","Line one.\nLine two with a ""quote"".",Software Development,ZZ1 1ZZ,"London, England, United Kingdom",,"[PORTFOLIO:https://ada.example.com],[OTHER:javascript:alert(1)]",\r\n',
  'Positions.csv': 'Company Name,Title,Description,Location,Started On,Finished On\n'
    + 'Example Labs,Senior Engineer,"Built things, shipped them.\nLed a team of 4.","London, United Kingdom",Mar 2021,\n'
    + 'Old Co,Engineer,<script>alert(1)</script>,Remote,Jan 2016,Feb 2021\n'
    + 'First Job Ltd,Intern,,Leeds,Jun 2014,Aug 2015\n',
  'Education.csv': 'School Name,Start Date,End Date,Notes,Degree Name,Activities\n'
    + 'University of Example,2011,2014,,BSc Computer Science,Chess club\n'
    + 'Example High School,2004,2011,,,\n',
  'Skills.csv': 'Name\nJavaScript\nTypeScript\njavascript\nBitcoin\n"Teaching, mentoring"\n',
  'Certifications.csv': 'Name,Url,Authority,Started On,Finished On,License Number\n'
    + 'Cloud Thing Associate,https://cert.example.com/123,Example Cloud,Jan 2022,Jan 2025,ABC-123\n'
    + 'Bad Link Cert,javascript:alert(1),Nobody,,,\n',
  'Connections.csv': 'Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\n'
    + 'First Name,Last Name,URL,Email Address,Company,Position,Connected On\n'
    + 'Bob,Fakeperson,https://www.linkedin.com/in/bob-fake,,Widgets Inc,CTO,01 Feb 2023\n'
    + 'Cara,Notreal,https://evil.example.com/x,cara@example.com,"Shop, Ltd",Owner,15 Mar 2020\n',
  'Messages.csv': 'CONVERSATION ID,FROM,TO,CONTENT\n1,a,b,"must never be read"\n',
};

export async function zip(JSZip, opts = {}) {
  const z = new JSZip();
  const dir = opts.dir ? z.folder(opts.dir) : z;
  for (const [n, t] of Object.entries(files)) dir.file(n, t);
  return z.generateAsync({ type: 'uint8array' });
}
