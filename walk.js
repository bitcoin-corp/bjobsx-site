// "How to get your LinkedIn export": one modal, shared by every page. Any [data-walk] element opens it.
(() => {
  const d = document.createElement('dialog');
  d.className = 'modal'; d.id = 'walk'; d.setAttribute('aria-labelledby', 'walkH');
  d.innerHTML = `<button class="x" type="button" data-close aria-label="Close">×</button><div class="mb">
    <h2 id="walkH">Get your LinkedIn export</h2>
    <p class="mute" style="margin:0 0 6px">LinkedIn lets you download a copy of your own data. It takes a few minutes to ask for, and LinkedIn emails you when it is ready (often within 10 minutes, sometimes up to a day).</p>
    <ol>
      <li>On LinkedIn, tap your picture, then <b>Settings &amp; Privacy</b>.</li>
      <li>Open <b>Data privacy</b>, then <b>Get a copy of your data</b>.</li>
      <li>Pick <b>Download larger data archive</b>, or tick just <b>Profile</b>, <b>Positions</b>, <b>Education</b>, <b>Skills</b>, <b>Certifications</b> (and <b>Connections</b> if you want them). Press <b>Request archive</b>.</li>
      <li>When LinkedIn's email arrives, download the ZIP file.</li>
      <li>Come back here and drop the ZIP (or the CSV files inside it) on <b>Import</b>.</li>
    </ol>
    <p class="hint">The file is read in your browser. It is never uploaded to us. Your connections are other people's details: they stay private to you and are never published.</p>
    <div class="walk" aria-label="Video walkthrough, coming soon"><div><b>Video walkthrough</b><span class="badge coming">Coming</span></div></div>
  </div>`;
  document.body.appendChild(d);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-walk]')) { e.preventDefault(); if (!d.open) d.showModal(); return; }
    if (e.target === d || (e.target.closest('[data-close]') && e.target.closest('#walk'))) d.close();
  });
})();
