type ResumeData = {
  name: string;
  title: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  summary: string;
  skills: {
    core: string[];
    tools?: string[];
    other?: string[];
  };
  experience: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    bullets: string[];
  }>;
  projects?: Array<{
    name: string;
    description: string;
    bullets?: string[];
    link?: string;
    technologies?: string[];
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    graduationDate?: string;
    details?: string[];
  }>;
  certifications?: string[];
};

function renderContact(contact: ResumeData['contact']): string {
  const parts = [
    'liam@liamcampbell.net',
    '(805) 625-3851',
    'https://linkedin.com/in/liamacampbell'
  ]
    .map((p) => `<span>${p}</span>`)
    .join('<span class="sep">•</span>');
  return `<div class="contact">${parts}</div>`;
}

function renderList(items?: string[], className?: string): string {
  if (!items || items.length === 0) return '';
  return `<ul class="${className || ''}">` + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
}

export function generateResumeHtml(data: ResumeData): string {
  const skillsBlocks: string[] = [];
  if (data.skills?.core?.length) skillsBlocks.push(`<div class="skill-group"><h3>Core</h3><div>${data.skills.core.join(', ')}</div></div>`);
  if (data.skills?.tools?.length) skillsBlocks.push(`<div class="skill-group"><h3>Tools</h3><div>${data.skills.tools!.join(', ')}</div></div>`);
  if (data.skills?.other?.length) skillsBlocks.push(`<div class="skill-group"><h3>Other</h3><div>${data.skills.other!.join(', ')}</div></div>`);

  const experience = (data.experience || [])
    .map((role) => {
      const dates: string[] = [];
      if (role.startDate) dates.push(role.startDate);
      if (role.endDate) dates.push(role.endDate);
      const headerRight = [dates.join(' – '), role.location].filter(Boolean).join(' • ');
      return `
        <div class="experience-item">
          <div class="item-info">
            <div class="title-row">
              <h4>${role.role}</h4>
              <div class="meta">${headerRight}</div>
            </div>
            <div class="company">${role.company}</div>
          </div>
          ${renderList(role.bullets, 'bullets')}
        </div>
      `;
    })
    .join('');

  const projects = (data.projects || [])
    .map((p) => {
      const right = [p.link].filter(Boolean).join('');
      return `
        <div class="project-item">
          <div class="item-info">
            <div class="title-row">
              <h4>${p.name}</h4>
              <div class="meta">${right}</div>
            </div>
            <div class="company">${p.technologies?.join(', ') || ''}</div>
          </div>
          <div class="description">${p.description}</div>
          ${renderList(p.bullets, 'bullets')}
        </div>
      `;
    })
    .join('');

  const education = `
    <div class="education-item">
      <div class="item-info">
        <div class="title-row">
          <h4>Business Administration (B.Sc)</h4>
          <div class="meta">Graduated May 2021</div>
        </div>
        <div class="company">University of California, Berkeley, Haas School of Business</div>
      </div>
    </div>
  `;

  const certs = renderList(data.certifications, 'bullets');

  return `
  <article class="resume">
    <header class="resume-header">
      <h1>${data.name}</h1>
      <h2>${data.title}</h2>
      ${renderContact(data.contact || {})}
    </header>

    <section class="section">
      <h3>Professional Summary</h3>
      <p class="summary">${data.summary}</p>
    </section>

    <section class="section">
      <h3>Skills</h3>
      <div class="skills">${skillsBlocks.join('')}</div>
    </section>

    ${experience ? `<section class="section"><h3>Experience</h3>${experience}</section>` : ''}
    ${projects ? `<section class="section"><h3>Projects</h3>${projects}</section>` : ''}
    ${education ? `<section class="section"><h3>Education</h3>${education}</section>` : ''}
    ${certs ? `<section class="section"><h3>Certifications</h3>${certs}</section>` : ''}
  </article>`;
}
