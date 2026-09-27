/**
 * diff.js — GitHub風差分生成モジュール (Unified / Split)
 * 文字・行単位の差分判定およびHTMLレンダリングを処理
 */

// HTML エスケープユーティリティ
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 文字単位の LCS (最長共通部分系列) 差分
 */
export function diffWordsOrChars(oldStr, newStr) {
  const s1 = oldStr || '';
  const s2 = newStr || '';
  const memo = Array.from({ length: s1.length + 1 }, () => Array(s2.length + 1).fill(0));

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        memo[i][j] = memo[i - 1][j - 1] + 1;
      } else {
        memo[i][j] = Math.max(memo[i - 1][j], memo[i][j - 1]);
      }
    }
  }

  let i = s1.length;
  let j = s2.length;
  const result = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && s1[i - 1] === s2[j - 1]) {
      result.push({ type: 'equal', text: s1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || memo[i][j - 1] >= memo[i - 1][j])) {
      result.push({ type: 'insert', text: s2[j - 1] });
      j--;
    } else {
      result.push({ type: 'delete', text: s1[i - 1] });
      i--;
    }
  }

  result.reverse();

  // 同種の変更タイプを結合
  const merged = [];
  for (const item of result) {
    const last = merged[merged.length - 1];
    if (last && last.type === item.type) {
      last.text += item.text;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

/**
 * 行単位の LCS 差分
 */
export function diffLines(oldText, newText) {
  const lines1 = (oldText || '').split('\n');
  const lines2 = (newText || '').split('\n');

  const memo = Array.from({ length: lines1.length + 1 }, () => Array(lines2.length + 1).fill(0));

  for (let i = 1; i <= lines1.length; i++) {
    for (let j = 1; j <= lines2.length; j++) {
      if (lines1[i - 1] === lines2[j - 1]) {
        memo[i][j] = memo[i - 1][j - 1] + 1;
      } else {
        memo[i][j] = Math.max(memo[i - 1][j], memo[i][j - 1]);
      }
    }
  }

  let i = lines1.length;
  let j = lines2.length;
  const result = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
      result.push({ type: 'normal', text: lines1[i - 1], lineOld: i, lineNew: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || memo[i][j - 1] >= memo[i - 1][j])) {
      result.push({ type: 'insert', text: lines2[j - 1], lineNew: j });
      j--;
    } else {
      result.push({ type: 'delete', text: lines1[i - 1], lineOld: i });
      i--;
    }
  }

  return result.reverse();
}

/**
 * 行差分を左右（Split用）にペアリング・整列し、内部差分をハイライト
 */
export function alignDiffLines(diffResults) {
  const rows = [];
  let idx = 0;

  while (idx < diffResults.length) {
    const item = diffResults[idx];

    if (item.type === 'normal') {
      rows.push({
        type: 'normal',
        left: { line: item.lineOld, text: item.text },
        right: { line: item.lineNew, text: item.text }
      });
      idx++;
    } else {
      // 連続する削除ブロックと追加ブロックを抽出
      const deletes = [];
      const inserts = [];

      while (idx < diffResults.length && diffResults[idx].type === 'delete') {
        deletes.push(diffResults[idx]);
        idx++;
      }
      while (idx < diffResults.length && diffResults[idx].type === 'insert') {
        inserts.push(diffResults[idx]);
        idx++;
      }

      const maxLen = Math.max(deletes.length, inserts.length);
      for (let k = 0; k < maxLen; k++) {
        const del = deletes[k] || null;
        const ins = inserts[k] || null;

        let leftText = del ? del.text : '';
        let rightText = ins ? ins.text : '';

        let leftHtml = escapeHtml(leftText);
        let rightHtml = escapeHtml(rightText);

        // 削除と追加が揃う行については、文字単位の差分をとってインラインハイライト
        if (del && ins) {
          const subDiff = diffWordsOrChars(leftText, rightText);
          leftHtml = '';
          rightHtml = '';
          for (const sub of subDiff) {
            if (sub.type === 'delete') {
              leftHtml += `<del class="diff-char-del">${escapeHtml(sub.text)}</del>`;
            } else if (sub.type === 'insert') {
              rightHtml += `<ins class="diff-char-ins">${escapeHtml(sub.text)}</ins>`;
            } else {
              leftHtml += escapeHtml(sub.text);
              rightHtml += escapeHtml(sub.text);
            }
          }
        }

        rows.push({
          type: del && ins ? 'modify' : (del ? 'delete' : 'insert'),
          left: del ? { line: del.lineOld, html: leftHtml } : null,
          right: ins ? { line: ins.lineNew, html: rightHtml } : null
        });
      }
    }
  }

  return rows;
}

/**
 * Unified (統合) ビューの HTML をレンダリング
 */
export function renderUnifiedHtml(rows) {
  let html = '<div class="diff-responsive"><table class="diff-table diff-table-unified"><tbody>';
  for (const row of rows) {
    if (row.type === 'normal') {
      html += `
        <tr class="diff-tr diff-tr-normal">
          <td class="diff-td-ln">${row.left.line}</td>
          <td class="diff-td-ln">${row.right.line}</td>
          <td class="diff-td-code"><span class="diff-marker"> </span>${escapeHtml(row.left.text)}</td>
        </tr>`;
    } else if (row.type === 'modify') {
      html += `
        <tr class="diff-tr diff-tr-delete">
          <td class="diff-td-ln">${row.left.line}</td>
          <td class="diff-td-ln"></td>
          <td class="diff-td-code"><span class="diff-marker">-</span>${row.left.html}</td>
        </tr>
        <tr class="diff-tr diff-tr-insert">
          <td class="diff-td-ln"></td>
          <td class="diff-td-ln">${row.right.line}</td>
          <td class="diff-td-code"><span class="diff-marker">+</span>${row.right.html}</td>
        </tr>`;
    } else if (row.type === 'delete') {
      html += `
        <tr class="diff-tr diff-tr-delete">
          <td class="diff-td-ln">${row.left.line}</td>
          <td class="diff-td-ln"></td>
          <td class="diff-td-code"><span class="diff-marker">-</span>${row.left.html}</td>
        </tr>`;
    } else if (row.type === 'insert') {
      html += `
        <tr class="diff-tr diff-tr-insert">
          <td class="diff-td-ln"></td>
          <td class="diff-td-ln">${row.right.line}</td>
          <td class="diff-td-code"><span class="diff-marker">+</span>${row.right.html}</td>
        </tr>`;
    }
  }
  html += '</tbody></table></div>';
  return html;
}

/**
 * Split (左右分割) ビューの HTML をレンダリング
 */
export function renderSplitHtml(rows) {
  let html = '<div class="diff-responsive"><table class="diff-table diff-table-split"><tbody>';
  for (const row of rows) {
    if (row.type === 'normal') {
      html += `
        <tr class="diff-tr diff-tr-normal">
          <td class="diff-td-ln">${row.left.line}</td>
          <td class="diff-td-code">${escapeHtml(row.left.text)}</td>
          <td class="diff-td-ln">${row.right.line}</td>
          <td class="diff-td-code">${escapeHtml(row.right.text)}</td>
        </tr>`;
    } else {
      const leftCell = row.left
        ? `<td class="diff-td-ln diff-td-ln-delete">${row.left.line}</td>
           <td class="diff-td-code diff-td-code-delete"><span class="diff-marker">-</span>${row.left.html}</td>`
        : `<td class="diff-td-ln diff-td-ln-empty"></td>
           <td class="diff-td-code diff-td-code-empty"></td>`;

      const rightCell = row.right
        ? `<td class="diff-td-ln diff-td-ln-insert">${row.right.line}</td>
           <td class="diff-td-code diff-td-code-insert"><span class="diff-marker">+</span>${row.right.html}</td>`
        : `<td class="diff-td-ln diff-td-ln-empty"></td>
           <td class="diff-td-code diff-td-code-empty"></td>`;

      html += `<tr class="diff-tr">${leftCell}${rightCell}</tr>`;
    }
  }
  html += '</tbody></table></div>';
  return html;
}
