// Content script pour récupérer le contenu HTML de la page
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHTML') {
    // Récupérer seulement la structure HTML de base
    const html = document.documentElement.cloneNode(true);
    
    // Supprimer tout le contenu du <head> sauf les éléments essentiels
    const head = html.querySelector('head');
    if (head) {
      // Garder seulement title, meta essentiels
      const essentialElements = head.querySelectorAll('title, meta[charset], meta[name="viewport"]');
      head.innerHTML = '';
      essentialElements.forEach(el => head.appendChild(el.cloneNode(true)));
    }
    
    // Supprimer tous les scripts et styles
    html.querySelectorAll('script, style, link[rel="stylesheet"]').forEach(el => el.remove());
    
    // Supprimer les attributs générés par les frameworks
    html.querySelectorAll('*').forEach(el => {
      // Supprimer les attributs Vue.js, React, etc.
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-v-') || 
            attr.name.startsWith('data-react-') ||
            attr.name.startsWith('_ngcontent-') ||
            attr.name === 'cz-shortcut-listen') {
          el.removeAttribute(attr.name);
        }
      });
    });
    
    // Construire le HTML final avec DOCTYPE
    const finalHtml = '<!DOCTYPE html>\n' + html.outerHTML;
    
    sendResponse({html: finalHtml});
  }
});
