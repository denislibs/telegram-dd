import { render } from 'frameact/dom';
import { enableStrict } from 'frameact/stricterdom';
import App from './components/App';

if (import.meta.env.DEV) enableStrict();

render(() => <App />, document.getElementById('root')!);
