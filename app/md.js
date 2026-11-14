// Mini-renderizador de markdown da plataforma.
// Blocos ```ecl viram editores (marcadores <div data-ecl>) que o app.js ativa depois.
(function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const SELOS = { crianca: '🧒 Para uma criança de 8 anos', tecnico: '🔧 Versão técnica', goggins: '🔥 Sem desculpas', cuidado: '⚠️ Armadilha', real: '🏢 No mundo real' };

  function emLinha(s) {
    const codigos = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0001${codigos.length - 1}\u0001`; });
    s = esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${esc(codigos[+i])}</code>`);
  }

  function render(md) {
    const linhas = (md || '').split(/\r?\n/);
    const out = [];
    let i = 0;
    const ehEspecial = (l) => /^(```|#{2,4} |> ?|[-*] |\d+\. |\|)/.test(l);
    while (i < linhas.length) {
      const l = linhas[i];
      if (!l.trim()) { i++; continue; }
      if (l.startsWith('```')) {
        const info = l.slice(3).trim();
        const corpo = [];
        i++;
        while (i < linhas.length && !linhas[i].startsWith('```')) corpo.push(linhas[i++]);
        i++;
        const codigo = corpo.join('\n');
        const [lingua, ...opc] = info.split(/\s+/);
        if (lingua === 'ecl' && !opc.includes('nao-rodar')) {
          const alvo = opc.find((o) => ['thor', 'hthor', 'roxie'].includes(o)) || 'hthor';
          out.push(`<div data-ecl data-alvo="${alvo}"><script type="text/plain">${codigo.replace(/<\/script/gi, '<\\/script')}<\/script></div>`);
        } else out.push(`<pre><code>${esc(codigo)}</code></pre>`);
        continue;
      }
      const h = l.match(/^(#{2,4}) (.*)$/);
      if (h) { out.push(`<h${h[1].length}>${emLinha(h[2])}</h${h[1].length}>`); i++; continue; }
      if (l.startsWith('>')) {
        const corpo = [];
        while (i < linhas.length && linhas[i].startsWith('>')) corpo.push(linhas[i++].replace(/^> ?/, ''));
        let classe = '';
        const m = corpo[0].match(/^\[(\w+)\]\s*(.*)$/);
        if (m && SELOS[m[1]]) { classe = m[1]; corpo[0] = m[2]; }
        out.push(`<blockquote class="${classe}">${classe ? `<span class="selo">${SELOS[classe]}</span>` : ''}${render(corpo.join('\n'))}</blockquote>`);
        continue;
      }
      if (l.startsWith('|')) {
        const tab = [];
        while (i < linhas.length && linhas[i].startsWith('|')) tab.push(linhas[i++]);
        const cel = (x) => x.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
        const temCab = tab[1] && /^\|[\s:|-]+$/.test(tab[1]);
        let html = '<table class="md">';
        if (temCab) html += '<tr>' + cel(tab[0]).map((c) => `<th>${emLinha(c)}</th>`).join('') + '</tr>';
        for (const r of tab.slice(temCab ? 2 : 0)) html += '<tr>' + cel(r).map((c) => `<td>${emLinha(c)}</td>`).join('') + '</tr>';
        out.push(html + '</table>');
        continue;
      }
      const li = l.match(/^([-*]|\d+\.) /);
      if (li) {
        const ord = /\d/.test(li[1]);
        const itens = [];
        while (i < linhas.length && /^([-*]|\d+\.) /.test(linhas[i])) {
          let item = linhas[i++].replace(/^([-*]|\d+\.) /, '');
          while (i < linhas.length && /^ {2,}\S/.test(linhas[i])) item += ' ' + linhas[i++].trim();
          itens.push(`<li>${emLinha(item)}</li>`);
        }
        out.push(`<${ord ? 'ol' : 'ul'}>${itens.join('')}</${ord ? 'ol' : 'ul'}>`);
        continue;
      }
      const par = [];
      while (i < linhas.length && linhas[i].trim() && !ehEspecial(linhas[i])) par.push(linhas[i++]);
      out.push(`<p>${emLinha(par.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  window.MD = { render, esc };
})();
