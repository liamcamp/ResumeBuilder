import './styles/main.scss';
import { renderApp } from './ui';

document.addEventListener('DOMContentLoaded', () => {
  renderApp(document.getElementById('app') as HTMLElement);
});
