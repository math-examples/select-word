(function() {
  var config = window.__APP_CONFIG__ || {};
  var version = config.version || 'v1.0.0';
  var base = config.base + version + '/js/';
  var files = config.files || [];
  var sriHashes = config.sriHashes || {};
  var cdns = config.cdns || ['https://cdn.jsdelivr.net'];

  // ── Display version in the badge ──
  function initVersionTag() {
    var tag = document.getElementById('versionTag');
    if (!tag) return;
    tag.textContent = version.replace(/^v/, '');
    tag.addEventListener('click', function() {
      var textToCopy = version;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(function() {
          showCopied(tag);
        }).catch(fallbackSelect);
      } else {
        fallbackSelect();
      }
      function fallbackSelect() {
        var range = document.createRange();
        range.selectNode(tag);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
      function showCopied(el) {
        var old = el.textContent;
        el.textContent = 'copied!';
        setTimeout(function() { el.textContent = old; }, 1000);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVersionTag);
  } else {
    initVersionTag();
  }

  // ── Load scripts with CDN fallback ──
  var loaded = 0;

  function loadScript(filename, retries) {
    retries = retries || 0;
    if (retries >= cdns.length) {
      console.error('All CDNs failed for', filename);
      var indicator = document.getElementById('loadingIndicator');
      if (indicator) {
        indicator.textContent = 'Failed to load ' + filename;
        indicator.style.display = 'block';
      }
      return;
    }

    var script = document.createElement('script');
    script.src = cdns[retries] + base + filename;
    if (sriHashes[filename]) {
      script.integrity = sriHashes[filename];
      script.crossOrigin = 'anonymous';
    }

    script.onload = function() {
      loaded++;
      if (loaded === files.length) {
        console.log('✓ All modules loaded');
      }
    };

    script.onerror = function() {
      loadScript(filename, retries + 1);
    };

    document.head.appendChild(script);
  }

  files.forEach(function(f) { loadScript(f); });
})();
