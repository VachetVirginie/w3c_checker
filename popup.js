const checkPageButton = document.getElementById('checkPage');
const resultDiv = document.getElementById('result');
const loadingDiv = document.getElementById('loading');
const buttonText = document.getElementById('buttonText');

if (checkPageButton) {
  checkPageButton.addEventListener('click', async function() {
    // Désactiver le bouton pendant la vérification
    checkPageButton.disabled = true;
    buttonText.textContent = 'Analyse en cours...';
    
    loadingDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
    
    try {
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      
      if (!tabs || tabs.length === 0) {
        throw new Error('Aucun onglet trouvé');
      }
      
      const currentUrl = tabs[0].url;
      const tabId = tabs[0].id;
      
      if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
        throw new Error('Cette extension ne fonctionne que sur les pages HTTP/HTTPS');
      }
      
      const response_html = await browser.tabs.sendMessage(tabId, {action: 'getHTML'});
      
      if (!response_html || !response_html.html) {
        throw new Error('Impossible de récupérer le contenu HTML de la page');
      }
      
      const htmlContent = response_html.html;
      
      const response = await fetch('https://html5.validator.nu/?out=json', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'User-Agent': 'Mozilla/5.0 (compatible; W3C-Validator-Extension/1.0)'
        },
        referrerPolicy: 'no-referrer',
        body: htmlContent
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Trop de requêtes. Veuillez attendre quelques minutes avant de retenter.');
        }
        throw new Error(`Erreur du validateur (${response.status})`);
      }
      
      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error('Réponse invalide du validateur W3C');
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
        const errors = allErrors.filter(error => 
          !ignoredErrors.some(ignored => error.message.includes(ignored))
        );
        const warnings = data.messages.filter(msg => msg.type === 'info' || msg.type === 'warning');
        
        resultDiv.innerHTML = '';
        
        // Résumé avec le nouveau style
        const summary = document.createElement('div');
        summary.className = 'result-summary';
        
        const filteredCount = allErrors.length - errors.length;
        const stats = document.createElement('div');
        stats.className = 'stats';
        
        const errorStat = document.createElement('div');
        errorStat.className = `stat-item${errors.length > 0 ? ' has-errors' : ''}`;
        errorStat.innerHTML = `Erreurs: ${errors.length}`;
        errorStat.setAttribute('role', 'status');
        errorStat.setAttribute('aria-label', `${errors.length} erreur${errors.length > 1 ? 's' : ''} trouvée${errors.length > 1 ? 's' : ''}`);
        
        const warningStat = document.createElement('div');
        warningStat.className = `stat-item${warnings.length > 0 ? ' has-warnings' : ''}`;
        warningStat.innerHTML = `Warnings: ${warnings.length}`;
        warningStat.setAttribute('role', 'status');
        warningStat.setAttribute('aria-label', `${warnings.length} avertissement${warnings.length > 1 ? 's' : ''} trouvé${warnings.length > 1 ? 's' : ''}`);
        
        stats.appendChild(errorStat);
        stats.appendChild(warningStat);
        
        if (filteredCount > 0) {
          const filteredNote = document.createElement('div');
          filteredNote.style.fontSize = '12px';
          filteredNote.style.color = '#718096';
          filteredNote.style.marginTop = '8px';
          filteredNote.textContent = `${filteredCount} erreurs CSS modernes ignorées`;
          summary.appendChild(stats);
          summary.appendChild(filteredNote);
        } else {
          summary.appendChild(stats);
        }
        
        resultDiv.appendChild(summary);
        
        // Afficher les erreurs avec le nouveau style
        if (errors.length > 0) {
          const errorSection = document.createElement('section');
          errorSection.className = 'section';
          errorSection.setAttribute('aria-labelledby', 'errors-heading');
          
          const errorTitle = document.createElement('h3');
          errorTitle.id = 'errors-heading';
          errorTitle.className = 'section-title errors';
          errorTitle.textContent = 'Erreurs';
          errorSection.appendChild(errorTitle);
          
          errors.forEach((error) => {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message-item error-item';
            
            if (error.lastLine) {
              const location = document.createElement('div');
              location.className = 'message-location';
              location.textContent = `Ligne ${error.lastLine}`;
              errorDiv.appendChild(location);
            }
            
            const message = document.createElement('div');
            message.textContent = error.message;
            errorDiv.appendChild(message);
            
            errorSection.appendChild(errorDiv);
          });
          
          resultDiv.appendChild(errorSection);
        }
        
        // Afficher les avertissements avec le nouveau style
        if (warnings.length > 0) {
          const warningSection = document.createElement('section');
          warningSection.className = 'section';
          warningSection.setAttribute('aria-labelledby', 'warnings-heading');
          
          const warningTitle = document.createElement('h3');
          warningTitle.id = 'warnings-heading';
          warningTitle.className = 'section-title warnings';
          warningTitle.textContent = 'Avertissements';
          warningSection.appendChild(warningTitle);
          
          warnings.forEach((warning) => {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'message-item warning-item';
            
            if (warning.lastLine) {
              const location = document.createElement('div');
              location.className = 'message-location';
              location.textContent = `Ligne ${warning.lastLine}`;
              warningDiv.appendChild(location);
            }
            
            const message = document.createElement('div');
            message.textContent = warning.message;
            warningDiv.appendChild(message);
            
            warningSection.appendChild(warningDiv);
          });
          
          resultDiv.appendChild(warningSection);
        }
        
        // Lien vers rapport complet (seulement pour sites publics)
        if (!currentUrl.includes('localhost') && !currentUrl.includes('127.0.0.1')) {
          const linkDiv = document.createElement('div');
          linkDiv.className = 'external-link';
          const link = document.createElement('a');
          link.href = 'https://validator.w3.org/nu/?doc=' + encodeURIComponent(currentUrl);
          link.target = '_blank';
          link.textContent = 'Voir le rapport complet sur W3C';
          linkDiv.appendChild(link);
          resultDiv.appendChild(linkDiv);
        }
        
        resultDiv.className = 'invalid';
      } else {
        resultDiv.innerHTML = '<div class="result-summary">La page est valide selon les normes W3C</div>';
        resultDiv.className = 'valid';
      }
      
      resultDiv.style.display = 'block';
    } catch (error) {
      loadingDiv.style.display = 'none';
      
      const errorDiv = document.createElement('div');
      errorDiv.className = 'result-summary';
      errorDiv.style.background = '#fed7d7';
      errorDiv.style.color = '#c53030';
      errorDiv.style.border = '1px solid #feb2b2';
      errorDiv.textContent = error.message;
      
      resultDiv.innerHTML = '';
      resultDiv.appendChild(errorDiv);
      resultDiv.className = 'invalid';
      resultDiv.style.display = 'block';
    } finally {
      // Réactiver le bouton
      checkPageButton.disabled = false;
      buttonText.textContent = 'Lancer l\'audit W3C';
    }
  });
}
