import { generateResumeHtml } from './utils/renderResume';
import { exportAsPdf, exportAsDocx } from './utils/exporters';
import { saveResumeToHistory, getResumeHistory, saveAboutMe as saveAboutMeToFirebase, getAboutMe as getAboutMeFromFirebase, type ResumeHistoryItem } from './firebase';

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, options?: { className?: string; text?: string }): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options?.className) el.className = options.className;
  if (options?.text) el.textContent = options.text;
  return el;
}

async function callGenerate(targetText: string): Promise<any> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetText })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate');
  }
  return res.json();
}


function renderTabs(): { tabs: HTMLElement; pages: Record<string, HTMLElement>; switchTo: (key: 'about' | 'generate') => void } {
  const nav = createElement('div', { className: 'tabs' });
  const tabAbout = createElement('button', { className: 'tab active', text: 'About Me' });
  const tabGen = createElement('button', { className: 'tab', text: 'Generate Resume' });
  nav.appendChild(tabAbout);
  nav.appendChild(tabGen);

  const pages: Record<string, HTMLElement> = {
    about: createElement('div', { className: 'tab-page' }),
    generate: createElement('div', { className: 'tab-page hidden' })
  };

  function switchTo(key: 'about' | 'generate') {
    if (key === 'about') {
      tabAbout.classList.add('active');
      tabGen.classList.remove('active');
      pages.about.classList.remove('hidden');
      pages.generate.classList.add('hidden');
    } else {
      tabGen.classList.add('active');
      tabAbout.classList.remove('active');
      pages.generate.classList.remove('hidden');
      pages.about.classList.add('hidden');
    }
  }

  tabAbout.addEventListener('click', () => switchTo('about'));
  tabGen.addEventListener('click', () => switchTo('generate'));

  return { tabs: nav, pages, switchTo };
}

export function renderApp(root: HTMLElement) {
  root.innerHTML = '';

  const container = createElement('div', { className: 'container' });
  const header = createElement('header', { className: 'header' });
  header.appendChild(createElement('h1', { text: 'Resume Builder' }));
  container.appendChild(header);

  const { tabs, pages, switchTo } = renderTabs();
  container.appendChild(tabs);

  // About Me editor
  (async () => {
    const aboutSection = createElement('section', { className: 'form-section' });
    const label = createElement('label', { className: 'label', text: 'About Me' });
    label.setAttribute('for', 'aboutMe');
    const textarea = createElement('textarea');
    textarea.id = 'aboutMe';
    textarea.rows = 16;
    textarea.placeholder = 'Write your background, achievements, tech stack, roles, etc.';
    textarea.value = await getAboutMeFromFirebase();
    const actions = createElement('div', { className: 'actions' });
    const saveBtn = createElement('button', { className: 'btn primary', text: 'Save' });
    actions.appendChild(saveBtn);
    aboutSection.appendChild(label);
    aboutSection.appendChild(textarea);
    aboutSection.appendChild(actions);
    pages.about.appendChild(aboutSection);

    saveBtn.addEventListener('click', async () => {
      try {
        saveBtn.setAttribute('disabled', 'true');
        saveBtn.textContent = 'Saving…';
        await saveAboutMeToFirebase(textarea.value);
      } catch (e: any) {
        alert(e.message || 'Failed to save');
      } finally {
        saveBtn.removeAttribute('disabled');
        saveBtn.textContent = 'Save';
      }
    });
  })();

  // Generate Resume page
  const form = createElement('section', { className: 'form-section' });
  const label = createElement('label', { className: 'label', text: 'Target company and job posting' });
  label.setAttribute('for', 'target');
  const textarea = createElement('textarea');
  textarea.id = 'target';
  textarea.placeholder = 'Paste target company info and job description here...';
  textarea.rows = 10;

  const actions = createElement('div', { className: 'actions' });
  const generateBtn = createElement('button', { className: 'btn primary', text: 'Generate Resume' });
  const pdfBtn = createElement('button', { className: 'btn', text: 'Download PDF' });
  const docxBtn = createElement('button', { className: 'btn', text: 'Download DOCX' });

  actions.appendChild(generateBtn);
  actions.appendChild(pdfBtn);
  actions.appendChild(docxBtn);

  form.appendChild(label);
  form.appendChild(textarea);
  form.appendChild(actions);

  // History section
  const historySection = createElement('section', { className: 'history-section' });
  const historyTitle = createElement('h3', { className: 'history-title', text: 'History' });
  const historyList = createElement('div', { className: 'history-list' });
  historySection.appendChild(historyTitle);
  historySection.appendChild(historyList);

  async function loadHistory() {
    try {
      const items = await getResumeHistory();
      historyList.innerHTML = '';
      if (items.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No history yet. Generate a resume to get started.</div>';
        return;
      }
      items.forEach(item => {
        const historyItem = createElement('div', { className: 'history-item' });
        const preview = item.targetText.substring(0, 100) + (item.targetText.length > 100 ? '...' : '');
        const date = new Date(item.timestamp).toLocaleString();
        historyItem.innerHTML = `
          <div class="history-item-preview">${preview}</div>
          <div class="history-item-date">${date}</div>
        `;
        historyItem.addEventListener('click', () => {
          textarea.value = item.targetText;
          previewInner.innerHTML = item.resumeHtml;
          lastResumeHtml = item.resumeHtml;
        });
        historyList.appendChild(historyItem);
      });
    } catch (e) {
      console.error('Failed to load history:', e);
      historyList.innerHTML = '<div class="history-empty">Failed to load history.</div>';
    }
  }

  loadHistory();

  const preview = createElement('section', { className: 'preview' });
  const previewInner = createElement('div', { className: 'resume-page' });
  previewInner.innerHTML = '<div class="preview-placeholder">Generate a resume to get started</div>';
  preview.appendChild(previewInner);

  const genPage = createElement('div', { className: 'generate-layout' });
  const leftColumn = createElement('div', { className: 'left-column' });
  leftColumn.appendChild(form);
  leftColumn.appendChild(historySection);
  genPage.appendChild(leftColumn);
  genPage.appendChild(preview);
  pages.generate.appendChild(genPage);

  container.appendChild(pages.about);
  container.appendChild(pages.generate);
  root.appendChild(container);

  let lastResumeHtml = '';

  generateBtn.addEventListener('click', async () => {
    generateBtn.setAttribute('disabled', 'true');
    generateBtn.textContent = 'Generating…';
    try {
      const targetText = textarea.value.trim();
      if (!targetText) throw new Error('Please paste target company / job info.');
      const { resume } = await callGenerate(targetText);
      const html = generateResumeHtml(resume);
      lastResumeHtml = html;
      previewInner.innerHTML = html;
      switchTo('generate');

      // Save to Firebase
      await saveResumeToHistory(targetText, html);
      await loadHistory();
    } catch (e: any) {
      alert(e.message || 'Generation failed');
    } finally {
      generateBtn.removeAttribute('disabled');
      generateBtn.textContent = 'Generate Resume';
    }
  });

  pdfBtn.addEventListener('click', async () => {
    if (!lastResumeHtml) return alert('Generate a resume first.');
    await exportAsPdf(lastResumeHtml, 'resume');
  });

  docxBtn.addEventListener('click', async () => {
    if (!lastResumeHtml) return alert('Generate a resume first.');
    await exportAsDocx(lastResumeHtml, 'resume');
  });
}
