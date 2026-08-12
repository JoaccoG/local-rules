

(function () {
  'use strict';

  class DCLogic {
    constructor(props) {
      this.props = props;
    }
  }

  function defaultProps(spec) {
    const out = {};
    for (const [key, def] of Object.entries(spec || {})) {
      if (def && 'default' in def) out[key] = def.default;
    }
    return out;
  }

  function mount() {
    const tag = document.querySelector('script[type="text/x-dc"][data-dc-script]');
    if (!tag) {
      console.error('[shim] no data-dc-script tag found');
      return;
    }
    let props = {};
    try {
      props = defaultProps(JSON.parse(tag.getAttribute('data-props') || '{}'));
    } catch (e) {
      console.warn('[shim] bad data-props JSON', e);
    }
    const q = new URLSearchParams(location.search);
    for (const key of Object.keys(props)) {
      if (q.has(key)) {
        const v = q.get(key);
        props[key] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
      }
    }
    const factory = new Function('DCLogic', tag.textContent + '\nreturn Component;');
    const Component = factory(DCLogic);
    const instance = new Component(props);
    window.__DC_INSTANCE = instance;
    instance.componentDidMount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
