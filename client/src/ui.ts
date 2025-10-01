import { generateResumeHtml } from './utils/renderResume';
import { exportAsPdf, exportAsDocx } from './utils/exporters';
// Firebase integrations are optional; fallback to server endpoints if not configured
import { saveResumeToHistory, getResumeHistory, saveAboutMe as saveAboutMeToFirebase, getAboutMe as getAboutMeFromFirebase } from './firebase';

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, options?: { className?: string; text?: string }): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options?.className) el.className = options.className;
  if (options?.text) el.textContent = options.text;
  return el;
}

async function callGenerate(targetText: string, aboutMe: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 180s for gpt-5

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetText, aboutMe }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate');
    }
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw e;
  }
}

function checkResumeOverflow(element: HTMLElement): { isOverflowing: boolean; actualHeight: number; targetHeight: number } {
  const TARGET_HEIGHT = 1123; // A4 page height in pixels
  const actualHeight = element.scrollHeight;

  return {
    isOverflowing: actualHeight > TARGET_HEIGHT,
    actualHeight,
    targetHeight: TARGET_HEIGHT
  };
}


function renderTabs(): { tabs: HTMLElement; pages: Record<string, HTMLElement>; switchTo: (key: 'about' | 'generate' | 'template') => void } {
  const nav = createElement('div', { className: 'tabs' });
  const tabAbout = createElement('button', { className: 'tab active', text: 'About Me' });
  const tabGen = createElement('button', { className: 'tab', text: 'Generate Resume' });
  const tabTemplate = createElement('button', { className: 'tab', text: 'Resume Template' });
  nav.appendChild(tabAbout);
  nav.appendChild(tabGen);
  nav.appendChild(tabTemplate);

  const pages: Record<string, HTMLElement> = {
    about: createElement('div', { className: 'tab-page' }),
    generate: createElement('div', { className: 'tab-page hidden' }),
    template: createElement('div', { className: 'tab-page hidden' })
  };

  function switchTo(key: 'about' | 'generate' | 'template') {
    tabAbout.classList.toggle('active', key === 'about');
    tabGen.classList.toggle('active', key === 'generate');
    tabTemplate.classList.toggle('active', key === 'template');
    pages.about.classList.toggle('hidden', key !== 'about');
    pages.generate.classList.toggle('hidden', key !== 'generate');
    pages.template.classList.toggle('hidden', key !== 'template');
  }

  tabAbout.addEventListener('click', () => switchTo('about'));
  tabGen.addEventListener('click', () => switchTo('generate'));
  tabTemplate.addEventListener('click', () => switchTo('template'));

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
    // Prefer Firestore; fallback to server
    try {
      textarea.value = await getAboutMeFromFirebase();
      if (!textarea.value) {
        const r = await fetch('/api/aboutme');
        const j = await r.json();
        textarea.value = j.content || '';
      }
    } catch {
      try {
        const r = await fetch('/api/aboutme');
        const j = await r.json();
        textarea.value = j.content || '';
      } catch { textarea.value = ''; }
    }
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
        // Try Firestore first, then server fallback
        try {
          await saveAboutMeToFirebase(textarea.value);
        } catch {
          await fetch('/api/aboutme', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: textarea.value }) });
        }
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
  const previewWrapper = createElement('div', { className: 'preview-wrapper' });
  const previewInner = createElement('div', { className: 'resume-page' });
  const cutoffLine = createElement('div', { className: 'page-cutoff-line' });
  const overflowWarning = createElement('div', { className: 'overflow-warning hidden' });
  overflowWarning.innerHTML = '⚠️ Content exceeds one page';

  previewInner.innerHTML = '<div class="preview-placeholder">Generate a resume to get started</div>';
  previewWrapper.appendChild(previewInner);
  previewWrapper.appendChild(cutoffLine);
  preview.appendChild(overflowWarning);
  preview.appendChild(previewWrapper);

  const genPage = createElement('div', { className: 'generate-layout' });
  const leftColumn = createElement('div', { className: 'left-column' });
  leftColumn.appendChild(form);
  leftColumn.appendChild(historySection);
  genPage.appendChild(leftColumn);
  genPage.appendChild(preview);
  pages.generate.appendChild(genPage);

  // Resume Template page with dummy data
  const templatePreview = createElement('section', { className: 'preview template-preview' });
  const templateInner = createElement('div', { className: 'resume-page' });
  const dummyResume = {
    name: 'Liam Campbell',
    title: 'Software Engineer',
    contact: {},
    summary: 'Results-driven software engineer with 5+ years of experience building scalable web applications. Specialized in full-stack development with expertise in React, Node.js, and cloud infrastructure. Proven track record of delivering high-impact projects that improve user experience and drive business growth.',
    skills: {
      core: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python'],
      tools: ['AWS', 'Docker', 'Git', 'PostgreSQL', 'Redis'],
      other: ['REST APIs', 'GraphQL', 'CI/CD', 'Agile/Scrum']
    },
    experience: [
      {
        company: 'Tech Innovations Inc.',
        role: 'Senior Software Engineer',
        location: 'San Francisco, CA',
        startDate: 'Jan 2022',
        endDate: 'Present',
        bullets: [
          'Led development of microservices architecture serving 2M+ daily active users',
          'Reduced API response time by 40% through caching optimization and database indexing',
          'Mentored team of 4 junior engineers, improving code quality and deployment velocity',
          'Implemented automated testing pipeline, increasing test coverage from 45% to 85%'
        ]
      },
      {
        company: 'StartupXYZ',
        role: 'Full Stack Developer',
        location: 'Remote',
        startDate: 'Jun 2020',
        endDate: 'Dec 2021',
        bullets: [
          'Built real-time collaboration features using WebSockets, increasing user engagement by 65%',
          'Designed and implemented RESTful APIs consumed by web and mobile applications',
          'Optimized frontend bundle size by 30%, improving page load times across all devices',
          'Collaborated with product team to define technical requirements and project roadmaps'
        ]
      },
      {
        company: 'Digital Solutions Co.',
        role: 'Software Developer',
        location: 'Oakland, CA',
        startDate: 'Aug 2018',
        endDate: 'May 2020',
        bullets: [
          'Developed customer-facing dashboard using React and Material-UI components',
          'Integrated third-party payment processing APIs, handling $500K+ in transactions',
          'Participated in code reviews and contributed to engineering best practices documentation',
          'Fixed critical production bugs, reducing customer support tickets by 25%'
        ]
      }
    ],
    projects: [
      {
        name: 'E-Commerce Platform',
        description: 'Full-featured online marketplace with payment processing and inventory management',
        technologies: ['React', 'Express', 'PostgreSQL', 'Stripe API'],
        bullets: [
          'Implemented shopping cart and checkout flow with Stripe integration',
          'Built admin dashboard for product and order management'
        ]
      }
    ],
    education: [],
    certifications: ['AWS Certified Solutions Architect', 'MongoDB Certified Developer']
  };
  templateInner.innerHTML = generateResumeHtml(dummyResume);
  templatePreview.appendChild(templateInner);
  pages.template.appendChild(templatePreview);

  container.appendChild(pages.about);
  container.appendChild(pages.generate);
  container.appendChild(pages.template);
  root.appendChild(container);

  let lastResumeHtml = '';

  generateBtn.addEventListener('click', async () => {
    generateBtn.setAttribute('disabled', 'true');
    generateBtn.textContent = 'Generating…';
    try {
      const targetText = textarea.value.trim();
      if (!targetText) throw new Error('Please paste target company / job info.');

      let aboutMe = '';
      try { aboutMe = await getAboutMeFromFirebase(); } catch {}
      if (!aboutMe) {
        try {
          const r = await fetch('/api/aboutme');
          const j = await r.json();
          aboutMe = j.content || '';
        } catch {}
      }
      if (!aboutMe || aboutMe.trim().length === 0) {
        throw new Error('Please fill in your About Me information first.');
      }

      const { resume } = await callGenerate(targetText, aboutMe);
      const html = generateResumeHtml(resume);
      lastResumeHtml = html;
      previewInner.innerHTML = html;
      switchTo('generate');

      // Check for overflow and show warning
      setTimeout(() => {
        const overflowCheck = checkResumeOverflow(previewInner);
        if (overflowCheck.isOverflowing) {
          overflowWarning.classList.remove('hidden');
          const overflow = overflowCheck.actualHeight - overflowCheck.targetHeight;
          console.log(`⚠️ Resume overflows by ${overflow}px (${overflowCheck.actualHeight}px total)`);
        } else {
          overflowWarning.classList.add('hidden');
          console.log(`✓ Resume fits within one page (${overflowCheck.actualHeight}px)`);
        }
      }, 100);

      // Save to Firebase (ignore if fails)
      try { await saveResumeToHistory(targetText, html); } catch {}
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
