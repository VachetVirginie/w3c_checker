// Système de debug
const debugContent = document.getElementById('debugContent');
const debugDiv = document.getElementById('debug');

function addDebug(msg) {
  console.log(msg);
  const line = document.createElement('div');
  line.className = 'debug-line';
  line.textContent = msg;
  debugContent.appendChild(line);
  debugDiv.style.display = 'block';
}

addDebug('popup.js chargé');

const checkPageButton = document.getElementById('checkPage');
const resultDiv = document.getElementById('result');
const loadingDiv = document.getElementById('loading');

addDebug('Éléments trouvés: button=' + !!checkPageButton + ', result=' + !!resultDiv + ', loading=' + !!loadingDiv);

if (checkPageButton) {
  checkPageButton.addEventListener('click', async function() {
    addDebug('--- Bouton cliqué ---');
    
    loadingDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
    debugContent.innerHTML = '';
    
    try {
      addDebug('Étape 1: Récupération des tabs');
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      addDebug('Tabs trouvés: ' + tabs.length);
      
      if (!tabs || tabs.length === 0) {
        throw new Error('Aucun onglet trouvé');
      }
      
      const currentUrl = tabs[0].url;
      const tabId = tabs[0].id;
      
      addDebug('URL: ' + currentUrl);
      addDebug('TabID: ' + tabId);
      
      if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
        throw new Error('URL non valide: ' + currentUrl);
      }
      
      addDebug('Étape 2: Récupération du HTML depuis la console');
      const response_html = await browser.tabs.sendMessage(tabId, {action: 'getHTML'});
      addDebug('Réponse reçue: ' + (response_html ? 'oui' : 'non'));
      
      if (!response_html || !response_html.html) {
        throw new Error('HTML non reçu');
      }
      
      const htmlContent = response_html.html;
      addDebug('Taille HTML: ' + htmlContent.length + ' caractères');
      
      addDebug('Étape 3: Envoi au validateur W3C');
      addDebug('HTML commence par: ' + htmlContent.substring(0, 50));
      addDebug('HTML contient DOCTYPE: ' + (htmlContent.includes('DOCTYPE') ? 'OUI' : 'NON'));
      
      const response = await fetch('https://html5.validator.nu/?out=json', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'User-Agent': 'Mozilla/5.0 (compatible; W3C-Validator-Extension/1.0)'
        },
        referrerPolicy: 'no-referrer',
        body: htmlContent
      });
      
      addDebug('Status: ' + response.status + ' ' + response.statusText);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Trop de requêtes - Attendez quelques minutes avant de retester');
        }
        throw new Error('HTTP ' + response.status);
      }
      
      const responseText = await response.text();
      addDebug('Réponse brute (100 chars): ' + responseText.substring(0, 100));
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        addDebug('Erreur JSON: ' + e.message);
        throw new Error('Le validateur a renvoyé du HTML au lieu de JSON');
      }
      addDebug('Données reçues: ' + (data.messages ? data.messages.length + ' messages' : 'aucun message'));
      
      // Debug: afficher les 3 premiers messages
      if (data.messages && data.messages.length > 0) {
        for (let i = 0; i < Math.min(3, data.messages.length); i++) {
          addDebug('Message ' + (i+1) + ': ' + data.messages[i].message);
        }
      }
      
      loadingDiv.style.display = 'none';
      
      if (data.messages && data.messages.length > 0) {
        // Filtrer les erreurs CSS modernes non critiques
        const ignoredErrors = [
          'CSS: Unrecognized at-rule "@layer"',
          'CSS: Parse Error',
          'CSS: "color-scheme" is not a "color" value',
          'CSS: "light dark" is not a valid color',
          'The "type" attribute for the "style" element is not needed'
        ];
        
        const allErrors = data.messages.filter(msg => msg.type === 'error');
        
        // Debug: afficher les premiers messages d'erreur pour voir le format exact
        if (allErrors.length > 0) {
          addDebug('Premier message erreur: "' + allErrors[0].message + '"');
        }
        
        const errors = allErrors.filter(error => 
          !ignoredErrors.some(ignored => error.message.includes(ignored))
        );
        const warnings = data.messages.filter(msg => msg.type === 'info' || msg.type === 'warning');
        
        resultDiv.innerHTML = '';
        
        // Résumé
        const summary = document.createElement('div');
        summary.style.marginBottom = '15px';
        summary.style.padding = '10px';
        summary.style.backgroundColor = '#f8f9fa';
        summary.style.borderRadius = '4px';
        
        const errorText = document.createElement('p');
        const filteredCount = allErrors.length - errors.length;
        let summaryText = `⚠️ <strong>${errors.length} erreur(s)</strong> • ℹ️ ${warnings.length} avertissement(s)`;
        if (filteredCount > 0) {
          summaryText += ` <span style="color: #666; font-size: 11px;">(${filteredCount} erreurs CSS modernes ignorées)</span>`;
        }
        errorText.innerHTML = summaryText;
        errorText.style.margin = '0';
        summary.appendChild(errorText);
        resultDiv.appendChild(summary);
        
        // Afficher les erreurs
        if (errors.length > 0) {
          const errorSection = document.createElement('div');
          errorSection.style.marginBottom = '10px';
          
          const errorTitle = document.createElement('h4');
          errorTitle.textContent = 'Erreurs:';
          errorTitle.style.color = '#dc3545';
          errorTitle.style.margin = '0 0 8px 0';
          errorTitle.style.fontSize = '14px';
          errorSection.appendChild(errorTitle);
          
          errors.forEach((error, index) => {
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '8px';
            errorDiv.style.marginBottom = '5px';
            errorDiv.style.backgroundColor = '#f8d7da';
            errorDiv.style.border = '1px solid #f5c6cb';
            errorDiv.style.borderRadius = '3px';
            errorDiv.style.fontSize = '12px';
            
            const location = error.lastLine ? `Ligne ${error.lastLine}` : '';
            errorDiv.innerHTML = `<strong>${location}</strong><br>${error.message}`;
            errorSection.appendChild(errorDiv);
          });
          
          resultDiv.appendChild(errorSection);
        }
        
        // Afficher les avertissements
        if (warnings.length > 0) {
          const warningSection = document.createElement('div');
          warningSection.style.marginBottom = '10px';
          
          const warningTitle = document.createElement('h4');
          warningTitle.textContent = 'Avertissements:';
          warningTitle.style.color = '#856404';
          warningTitle.style.margin = '0 0 8px 0';
          warningTitle.style.fontSize = '14px';
          warningSection.appendChild(warningTitle);
          
          warnings.forEach((warning, index) => {
            const warningDiv = document.createElement('div');
            warningDiv.style.padding = '8px';
            warningDiv.style.marginBottom = '5px';
            warningDiv.style.backgroundColor = '#fff3cd';
            warningDiv.style.border = '1px solid #ffeaa7';
            warningDiv.style.borderRadius = '3px';
            warningDiv.style.fontSize = '12px';
            
            const location = warning.lastLine ? `Ligne ${warning.lastLine}` : '';
            warningDiv.innerHTML = `<strong>${location}</strong><br>${warning.message}`;
            warningSection.appendChild(warningDiv);
          });
          
          resultDiv.appendChild(warningSection);
        }
        
        // Lien vers rapport complet (seulement pour sites publics)
        if (!currentUrl.includes('localhost') && !currentUrl.includes('127.0.0.1')) {
          const linkP = document.createElement('p');
          linkP.style.marginTop = '15px';
          const link = document.createElement('a');
          link.href = 'https://validator.w3.org/nu/?doc=' + encodeURIComponent(currentUrl);
          link.target = '_blank';
          link.textContent = 'Voir le rapport complet sur W3C';
          link.style.fontSize = '12px';
          linkP.appendChild(link);
          resultDiv.appendChild(linkP);
        }
        
        resultDiv.className = 'invalid';
      } else {
        resultDiv.innerHTML = '✅ La page est valide selon les normes W3C !';
        resultDiv.className = 'valid';
      }
      
      resultDiv.style.display = 'block';
      addDebug('✅ Succès!');
    } catch (error) {
      addDebug('❌ ERREUR: ' + error.message);
      
      loadingDiv.style.display = 'none';
      resultDiv.textContent = '';
      const p = document.createElement('p');
      p.style.color = 'red';
      p.textContent = '❌ ' + error.message;
      resultDiv.appendChild(p);
      resultDiv.className = 'invalid';
      resultDiv.style.display = 'block';
    }
  });
} else {
  addDebug('❌ Bouton non trouvé!');
}
