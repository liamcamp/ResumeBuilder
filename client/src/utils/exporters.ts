import html2pdf from 'html2pdf.js';

export async function exportAsPdf(html: string, filename: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const element = container.firstElementChild as HTMLElement;

  const opt = {
    margin:       [0.5, 0.5],
    filename:     `${filename}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  } as any;

  await html2pdf().from(element).set(opt).save();
}

export async function exportAsDocx(html: string, filename: string) {
  const res = await fetch('/api/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err.error || 'Failed to export DOCX');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
