const checkPageButton = document.getElementById('checkPage');
const resultDiv = document.getElementById('result');
const loadingDiv = document.getElementById('loading');
const buttonText = document.getElementById('buttonText');

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  copy: 'copy',
  check: 'check',
  error: 'error'
};

if (checkPageButton) {
  checkPageButton.addEventListener('click', async function() {
    // Désactiver le bouton pendant la vérification
    checkPageButton.disabled = true;
    buttonText.textContent = 'Analyse en cours...';
    
    loadingDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    clearElement(resultDiv);
    
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
        
        clearElement(resultDiv);
        
        // Résumé avec le nouveau style
        const summary = document.createElement('div');
        summary.className = 'result-summary';
        
        const filteredCount = allErrors.length - errors.length;
        const stats = document.createElement('div');
        stats.className = 'stats';
        
        const errorStat = document.createElement('div');
        errorStat.className = `stat-item${errors.length > 0 ? ' has-errors' : ''}`;
        errorStat.textContent = `Erreurs: ${errors.length}`;
        errorStat.setAttribute('role', 'status');
        errorStat.setAttribute('aria-label', `${errors.length} erreur${errors.length > 1 ? 's' : ''} trouvée${errors.length > 1 ? 's' : ''}`);
        
        const warningStat = document.createElement('div');
        warningStat.className = `stat-item${warnings.length > 0 ? ' has-warnings' : ''}`;
        warningStat.textContent = `Warnings: ${warnings.length}`;
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
          
          const errorHeader = document.createElement('div');
          errorHeader.className = 'section-header';
          
          const errorTitle = document.createElement('h3');
          errorTitle.id = 'errors-heading';
          errorTitle.className = 'section-title errors';
          errorTitle.textContent = 'Erreurs';
          
          const uniqueErrors = getUniqueMessages(errors);
          
          // Variables pour le suivi de l'affichage
          let currentDisplayedErrors = uniqueErrors;
          let isErrorsFiltered = false;
          
          const errorCopyButton = createCopyButton(
            () => copyMessagesToClipboard(currentDisplayedErrors, isErrorsFiltered),
            'Copier les erreurs'
          );
          
          errorHeader.appendChild(errorTitle);
          errorHeader.appendChild(errorCopyButton);
          errorSection.appendChild(errorHeader);

          if (uniqueErrors.length < errors.length) {
            const duplicateSection = await getErrorDuplicateToggle();
            errorSection.appendChild(duplicateSection);
            
            const filterEnabled = await getPreference('filterErrorDuplicates', false);
            currentDisplayedErrors = filterEnabled ? uniqueErrors : errors;
            isErrorsFiltered = filterEnabled;

            duplicateSection.querySelector('input').addEventListener('change', async e => {
              await savePreference('filterErrorDuplicates', e.target.checked);
              
              currentDisplayedErrors = e.target.checked ? uniqueErrors : errors;
              isErrorsFiltered = e.target.checked;
              
              const errorList = getErrorList(
                e.target.checked ? uniqueErrors : errors,
                !e.target.checked
              );
              
              errorSection.replaceChild(errorList, errorSection.querySelector('#errors-list'));
            });
            
            const errorsList = getErrorList(filterEnabled ? uniqueErrors : errors, !filterEnabled);
            errorSection.appendChild(errorsList);
          } else {
            const errorsList = getErrorList(uniqueErrors);
            errorSection.appendChild(errorsList);
          }
          
          resultDiv.appendChild(errorSection);
        }
        
        // Afficher les avertissements avec le nouveau style
        if (warnings.length > 0) {
          const warningSection = document.createElement('section');
          warningSection.className = 'section';
          warningSection.setAttribute('aria-labelledby', 'warnings-heading');
          
          const warningHeader = document.createElement('div');
          warningHeader.className = 'section-header';
          
          const warningTitle = document.createElement('h3');
          warningTitle.id = 'warnings-heading';
          warningTitle.className = 'section-title warnings';
          warningTitle.textContent = 'Avertissements';
          
          const uniqueWarnings = getUniqueMessages(warnings);
          
          // Variables pour le suivi de l'affichage
          let currentDisplayedWarnings = uniqueWarnings;
          let isWarningsFiltered = false;
          
          const warningCopyButton = createCopyButton(
            () => copyMessagesToClipboard(currentDisplayedWarnings, isWarningsFiltered),
            'Copier les avertissements'
          );
          
          warningHeader.appendChild(warningTitle);
          warningHeader.appendChild(warningCopyButton);
          warningSection.appendChild(warningHeader);

          if (uniqueWarnings.length < warnings.length) {
            const duplicateSection = await getWarningDuplicateToggle();
            warningSection.appendChild(duplicateSection);
            
            const filterEnabled = await getPreference('filterWarningDuplicates', false);
            currentDisplayedWarnings = filterEnabled ? uniqueWarnings : warnings;
            isWarningsFiltered = filterEnabled;

            duplicateSection.querySelector('input').addEventListener('change', async e => {
              await savePreference('filterWarningDuplicates', e.target.checked);
              
              currentDisplayedWarnings = e.target.checked ? uniqueWarnings : warnings;
              isWarningsFiltered = e.target.checked;
              
              const warningList = getWarningList(
                e.target.checked ? uniqueWarnings : warnings,
                !e.target.checked
              );

              warningSection.replaceChild(warningList, warningSection.querySelector('#warnings-list'));
            });
            
            const warningsList = getWarningList(filterEnabled ? uniqueWarnings : warnings, !filterEnabled);
            warningSection.appendChild(warningsList);
          } else {
            const warningsList = getWarningList(uniqueWarnings);
            warningSection.appendChild(warningsList);
          }

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
        clearElement(resultDiv);
        const successDiv = document.createElement('div');
        successDiv.className = 'result-summary';
        successDiv.textContent = 'La page est valide selon les normes W3C';
        resultDiv.appendChild(successDiv);
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
      
      clearElement(resultDiv);
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

// Copier une liste de messages dans le presse-papiers
function copyMessagesToClipboard(messages, isFiltered = false) {
  if (messages.length === 0) return navigator.clipboard.writeText('');
  
  const text = messages.map(msg => {
    const line = isFiltered || !msg.lastLine ? '' : `[Ligne ${msg.lastLine}] `;
    return `• ${line}${msg.message}`;
  }).join('\n');
  
  return navigator.clipboard.writeText(text);
}
 
function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// Créer une icône SVG
function createSvgIcon(iconType) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'copy-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  switch (iconType) {
    case ICONS.copy: {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '9');
      rect.setAttribute('y', '9');
      rect.setAttribute('width', '13');
      rect.setAttribute('height', '13');
      rect.setAttribute('rx', '2');
      rect.setAttribute('ry', '2');
      svg.appendChild(rect);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
      svg.appendChild(path);
      break;
    }
    case ICONS.check: {
      const polyline = document.createElementNS(SVG_NS, 'polyline');
      polyline.setAttribute('points', '20 6 9 17 4 12');
      svg.appendChild(polyline);
      break;
    }
    case ICONS.error: {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '10');
      svg.appendChild(circle);

      const line1 = document.createElementNS(SVG_NS, 'line');
      line1.setAttribute('x1', '12');
      line1.setAttribute('y1', '8');
      line1.setAttribute('x2', '12');
      line1.setAttribute('y2', '12');
      svg.appendChild(line1);

      const line2 = document.createElementNS(SVG_NS, 'line');
      line2.setAttribute('x1', '12');
      line2.setAttribute('y1', '16');
      line2.setAttribute('x2', '12.01');
      line2.setAttribute('y2', '16');
      svg.appendChild(line2);
      break;
    }
    default:
      break;
  }

  return svg;
}

// Créer un bouton de copie avec feedback visuel
function createCopyButton(copyFunction, label) {
  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  
  const iconElement = createSvgIcon(ICONS.copy);
  const textSpan = document.createElement('span');
  textSpan.textContent = label;

  copyButton.appendChild(iconElement);
  copyButton.appendChild(textSpan);
  copyButton.setAttribute('aria-label', label);
  
  const updateButton = (icon, text, className = '') => {
    if (className) copyButton.classList.add(className);
    else copyButton.classList.remove('copied');

    while (copyButton.firstChild) {
      copyButton.removeChild(copyButton.firstChild);
    }

    const newIconElement = createSvgIcon(icon);
    const newTextSpan = document.createElement('span');
    newTextSpan.textContent = text;

    copyButton.appendChild(newIconElement);
    copyButton.appendChild(newTextSpan);
  };
  
  copyButton.addEventListener('click', async () => {
    try {
      await copyFunction();
      updateButton(ICONS.check, 'Copié !', 'copied');
      setTimeout(() => updateButton(ICONS.copy, label), 3000);
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      updateButton(ICONS.error, 'Erreur');
      setTimeout(() => updateButton(ICONS.copy, label), 3000);
    }
  });
  
  return copyButton;
}

// Obtenir les messages uniques (filtrer les doublons)
function getUniqueMessages(messages) {
  const messageMap = new Map();
  messages.forEach(msg => {
    const cleanMsg = {
      ...msg, 
      message: msg.message.replace(' (Suppressing further warnings from this subtree.)', '').trim()
    };
    messageMap.set(cleanMsg.message, cleanMsg);
  });
  return Array.from(messageMap.values());
}

// Sauvegarder une préférence utilisateur
async function savePreference(key, value) {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des préférences:', error);
  }
}

// Récupérer une préférence utilisateur
async function getPreference(key, defaultValue) {
  try {
    const result = await browser.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error('Erreur lors de la récupération des préférences:', error);
    return defaultValue;
  }
}

// Créer la liste d'affichage des erreurs
function getErrorList(errors, showlines = true) {
  const errorsList = document.createElement('ul');
  errorsList.id = 'errors-list';
  errors.forEach((error) => {
    const errorItem = document.createElement('li');
    errorItem.className = 'message-item error-item';

    if (error.lastLine && showlines) {
      const location = document.createElement('div');
      location.className = 'message-location';
      location.textContent = `Ligne ${error.lastLine}`;
      errorItem.appendChild(location);
    }
    
    const message = document.createElement('div');
    message.textContent = error.message;
    errorItem.appendChild(message);
    
    errorsList.appendChild(errorItem);
  });
  return errorsList;
}

// Créer la liste d'affichage des avertissements
function getWarningList(warnings, showlines = true) {
  const warningsList = document.createElement('ul');
  warningsList.id = 'warnings-list';
  warnings.forEach((warning) => {
    const warningItem = document.createElement('li');
    warningItem.className = 'message-item warning-item';

    if (warning.lastLine && showlines) {
      const location = document.createElement('div');
      location.className = 'message-location';
      location.textContent = `Ligne ${warning.lastLine}`;
      warningItem.appendChild(location);
    }
    
    const message = document.createElement('div');
    message.textContent = warning.message;
    warningItem.appendChild(message);
    
    warningsList.appendChild(warningItem);
  });
  return warningsList;
}

// Créer le toggle de filtrage des erreurs en double
async function getErrorDuplicateToggle() {
  const duplicateSection = document.createElement('div');
  duplicateSection.className = 'duplicate-section switch';
  const errorDuplicateToggle = document.createElement('input');
  errorDuplicateToggle.setAttribute('type', 'checkbox');
  errorDuplicateToggle.checked = await getPreference('filterErrorDuplicates', false);
  errorDuplicateToggle.id = 'error-duplicate-toggle';
  duplicateSection.appendChild(errorDuplicateToggle);
  const errorDuplicateLabel = document.createElement('label');
  errorDuplicateLabel.htmlFor = 'error-duplicate-toggle';
  const visibleToggle = document.createElement('div');
  visibleToggle.className = 'visible-switch';
  const labelContent = document.createElement('span');
  labelContent.textContent = 'Filtrer les erreurs en double';
  errorDuplicateLabel.appendChild(visibleToggle);
  errorDuplicateLabel.appendChild(labelContent);
  duplicateSection.appendChild(errorDuplicateLabel);
  return duplicateSection;
}

// Créer le toggle de filtrage des avertissements en double
async function getWarningDuplicateToggle() {
  const duplicateSection = document.createElement('div');
  duplicateSection.className = 'duplicate-section switch';
  const warningDuplicateToggle = document.createElement('input');
  warningDuplicateToggle.setAttribute('type', 'checkbox');
  warningDuplicateToggle.checked = await getPreference('filterWarningDuplicates', false);
  warningDuplicateToggle.id = 'warning-duplicate-toggle';
  duplicateSection.appendChild(warningDuplicateToggle);
  const warningDuplicateLabel = document.createElement('label');
  warningDuplicateLabel.htmlFor = 'warning-duplicate-toggle';
  const visibleToggle = document.createElement('div');
  visibleToggle.className = 'visible-switch';
  const labelContent = document.createElement('span');
  labelContent.textContent = 'Filtrer les avertissements en double';
  warningDuplicateLabel.appendChild(visibleToggle);
  warningDuplicateLabel.appendChild(labelContent);
  duplicateSection.appendChild(warningDuplicateLabel);
  return duplicateSection;
}