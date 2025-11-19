browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHTML') {
    const html = document.documentElement.cloneNode(true);
    
    const head = html.querySelector('head');
    if (head) {
      const essentialElements = head.querySelectorAll('title, meta[charset], meta[name="viewport"]');
      head.innerHTML = '';
      essentialElements.forEach(el => head.appendChild(el.cloneNode(true)));
    }
    
    html.querySelectorAll('script, style, link[rel="stylesheet"]').forEach(el => el.remove());
    
    html.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-v-') || 
            attr.name.startsWith('data-react-') ||
            attr.name.startsWith('_ngcontent-') ||
            attr.name === 'cz-shortcut-listen') {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    const finalHtml = '<!DOCTYPE html>\n' + html.outerHTML;
    
    sendResponse({html: finalHtml});
  }
});
