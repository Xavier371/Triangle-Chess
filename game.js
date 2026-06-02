const boardSize = 8;
let board = [];
let currentPlayer = 'white';
let selectedPiece = null;
let isDragging = false;
let gameMode = '1p'; // '1p' or '2p'

// Keyboard navigation state
let _kbPieceIdx = 0;

// Last move highlight
let lastMoveFrom = null;
let lastMoveTo   = null;

// Remember where each color last landed so auto-select tracks the right piece
const _lastMovedTo = { white: null, black: null };

// Pointer-drag state
let dragGhost     = null;
let dragPointerId = null;

function initializeBoard() {
    board = Array.from({ length: boardSize }, () => Array(boardSize).fill(null));
    lastMoveFrom = null;
    lastMoveTo   = null;
    removeGhost();

    for (let i = 0; i < boardSize; i++) board[1][i] = 'black';
    for (let i = 0; i < boardSize; i++) board[boardSize - 2][i] = 'white';

    currentPlayer = 'white';
    _kbPieceIdx   = 0;
    selectedPiece = null;
    renderBoard();
    autoSelectFirstPiece();
    updateGameStatus();
    updatePlayerLabels();
}

// ── Helper: compute valid moves for a piece ──────────────
function getValidMoves(row, col) {
    const moves = [];
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize &&
            isValidMove(row, col, nr, nc)) {
            moves.push({ row: nr, col: nc });
        }
    });
    return moves;
}

// ── Helper: remove floating ghost ────────────────────────
function removeGhost() {
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    dragPointerId = null;
    isDragging    = false;
}

// ── Helper: cell under a point ───────────────────────────
function cellAt(x, y) {
    if (dragGhost) dragGhost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    if (dragGhost) dragGhost.style.display = '';
    if (!el) return null;
    const cell = el.closest('#game-board div[data-row]');
    if (!cell) return null;
    return { row: parseInt(cell.dataset.row), col: parseInt(cell.dataset.col) };
}

// ── Piece SVG ────────────────────────────────────────────
let _svgId = 0;
function makeTriangleSVG(color) {
    const uid = 'tc' + (_svgId++);
    const isWhite = color === 'white';

    const pts   = isWhite ? '30,8  5,55 55,55' : '30,55  5,8 55,8';
    const inner = isWhite ? '30,14 9,51 51,51'  : '30,49  9,12 51,12';
    const g1    = isWhite ? '#f8f8f8' : '#3a3a3a';
    const g2    = isWhite ? '#cccccc' : '#111111';
    const hi    = isWhite ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.10)';
    const stroke = '#111111';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="100%" height="100%" style="display:block;pointer-events:none;">
  <defs>
    <linearGradient id="${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="${g1}"/>
      <stop offset="100%" stop-color="${g2}"/>
    </linearGradient>
  </defs>
  <polygon points="${pts}"   fill="url(#${uid})" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/>
  <polygon points="${inner}" fill="none"          stroke="${hi}"     stroke-width="1.2"/>
</svg>`;
}

// ── Render ───────────────────────────────────────────────
function renderBoard() {
    const gameBoard = document.getElementById('game-board');
    gameBoard.innerHTML = '';

    const validMoves = selectedPiece
        ? getValidMoves(selectedPiece.row, selectedPiece.col)
        : [];
    const validSet = new Set(validMoves.map(m => `${m.row},${m.col}`));

    for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
            const cell = document.createElement('div');
            cell.dataset.row = row;
            cell.dataset.col = col;

            if (lastMoveFrom && lastMoveFrom.row === row && lastMoveFrom.col === col) cell.classList.add('last-move');
            if (lastMoveTo   && lastMoveTo.row   === row && lastMoveTo.col   === col) cell.classList.add('last-move');
            if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) cell.classList.add('selected');
            if (validSet.has(`${row},${col}`)) cell.classList.add(board[row][col] ? 'valid-capture' : 'valid-move');

            if (board[row][col]) {
                const triangle = document.createElement('div');
                triangle.className = 'triangle ' + board[row][col];
                triangle.innerHTML = makeTriangleSVG(board[row][col]);

                const isMyPiece =
                    (board[row][col] === 'white' && currentPlayer === 'white') ||
                    (gameMode === '2p' && board[row][col] === 'black' && currentPlayer === 'black');

                if (isMyPiece) {
                    triangle.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        selectedPiece = { row, col };
                        renderBoard();

                        const cellRect = cell.getBoundingClientRect();
                        dragGhost = document.createElement('div');
                        dragGhost.className = 'triangle ' + board[row][col] + ' drag-ghost';
                        dragGhost.style.cssText = `
                            position:fixed;
                            width:${cellRect.width}px;
                            height:${cellRect.height}px;
                            inset:unset;
                            pointer-events:none;
                            z-index:9999;
                            left:0; top:0;
                            transform:translate(${e.clientX - cellRect.width/2}px,${e.clientY - cellRect.height/2}px);
                        `;
                        dragGhost.innerHTML = makeTriangleSVG(board[row][col]);
                        document.body.appendChild(dragGhost);
                        dragPointerId = e.pointerId;
                        isDragging    = true;
                    }, { passive: false });
                }

                cell.appendChild(triangle);
            }

            cell.addEventListener('click', () => cellClick(row, col));
            gameBoard.appendChild(cell);
        }
    }
}

// ── Global pointer handlers ───────────────────────────────
document.addEventListener('pointermove', (e) => {
    if (!isDragging || !dragGhost || e.pointerId !== dragPointerId) return;
    const w = parseFloat(dragGhost.style.width);
    const h = parseFloat(dragGhost.style.height);
    dragGhost.style.transform =
        `translate(${e.clientX - w/2}px,${e.clientY - h/2}px)`;
});

document.addEventListener('pointerup', (e) => {
    if (!isDragging || e.pointerId !== dragPointerId) return;

    const target = cellAt(e.clientX, e.clientY);
    removeGhost();

    if (target && selectedPiece) {
        const { row: toRow, col: toCol } = target;
        if (toRow === selectedPiece.row && toCol === selectedPiece.col) {
            // Dropped on same square — keep selected
        } else if (isValidMove(selectedPiece.row, selectedPiece.col, toRow, toCol)) {
            movePiece(selectedPiece.row, selectedPiece.col, toRow, toCol);
            return;
        } else {
            selectedPiece = null;
        }
    } else {
        selectedPiece = null;
    }
    renderBoard();
});

document.addEventListener('pointercancel', (e) => {
    if (e.pointerId === dragPointerId) { removeGhost(); selectedPiece = null; renderBoard(); }
});

// ── Click logic ──────────────────────────────────────────
function cellClick(row, col) {
    const isPlayerTurn = (currentPlayer === 'white') ||
                         (gameMode === '2p' && currentPlayer === 'black');
    if (!isPlayerTurn) return;

    if (board[row][col] === currentPlayer) {
        // Select this piece; clicking it again keeps it selected (no toggle)
        selectedPiece = { row, col };
        const pieces = getPlayerPieces(currentPlayer);
        _kbPieceIdx = pieces.findIndex(p => p.row === row && p.col === col);
        if (_kbPieceIdx < 0) _kbPieceIdx = 0;
        renderBoard();
        return;
    }

    if (selectedPiece && isValidMove(selectedPiece.row, selectedPiece.col, row, col)) {
        movePiece(selectedPiece.row, selectedPiece.col, row, col);
        return;
    }

    // Clicked away — empty square that is not a valid destination
    if (!board[row][col]) {
        selectedPiece = null;
        renderBoard();
    }
}

// ── Move + win detection ──────────────────────────────────
function movePiece(fromRow, fromCol, toRow, toCol) {
    const movingPiece   = board[fromRow][fromCol];
    const capturedPiece = board[toRow][toCol];

    lastMoveFrom = { row: fromRow, col: fromCol };
    lastMoveTo   = { row: toRow,   col: toCol   };
    _lastMovedTo[movingPiece] = { row: toRow, col: toCol };

    board[toRow][toCol]     = movingPiece;
    board[fromRow][fromCol] = null;

    // Promotion wins
    if (movingPiece === 'white' && toRow === 0) {
        renderBoard();
        showWinModal(gameMode === '1p' ? 'You Win!' : 'White Wins!', 'White promoted to the far rank.');
        return;
    }
    if (movingPiece === 'black' && toRow === boardSize - 1) {
        renderBoard();
        showWinModal(gameMode === '1p' ? 'Computer Wins.' : 'Black Wins!', 'Black promoted to the far rank.');
        return;
    }

    // Capture-all wins
    if (capturedPiece) {
        const wLeft = countPieces('white');
        const bLeft = countPieces('black');
        if (wLeft === 0) {
            renderBoard();
            showWinModal(gameMode === '1p' ? 'Computer Wins.' : 'Black Wins!', 'All white pieces were captured.');
            return;
        }
        if (bLeft === 0) {
            renderBoard();
            showWinModal(gameMode === '1p' ? 'You Win!' : 'White Wins!', 'All black pieces were captured.');
            return;
        }
    }

    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    const isHumanTurn = currentPlayer === 'white' ||
                        (gameMode === '2p' && currentPlayer === 'black');
    if (isHumanTurn) autoSelectFirstPiece(); else selectedPiece = null;
    renderBoard();
    updateGameStatus();

    if (gameMode === '1p' && currentPlayer === 'black') {
        setTimeout(makeBlackMove, 420);
    }
}

function countPieces(color) {
    let count = 0;
    for (let row = 0; row < boardSize; row++)
        for (let col = 0; col < boardSize; col++)
            if (board[row][col] === color) count++;
    return count;
}

function isValidMove(row, col, newRow, newCol) {
    if (board[row][col] !== currentPlayer) return false;
    if (board[newRow][newCol] === board[row][col]) return false;
    const rd = Math.abs(newRow - row), cd = Math.abs(newCol - col);
    return (rd === 1 && cd === 0) || (rd === 0 && cd === 1);
}

// ── Win Modal ─────────────────────────────────────────────
function showWinModal(title, detail) {
    document.getElementById('win-title').textContent   = title;
    document.getElementById('win-detail').textContent  = detail;
    document.getElementById('win-modal').classList.remove('hidden');
}
function closeWinModal() {
    document.getElementById('win-modal').classList.add('hidden');
    initializeBoard();
}

// ── Status & labels ───────────────────────────────────────
function updateGameStatus() {
    const status = document.getElementById('game-status');
    if (!status) return;
    const isWhite = currentPlayer === 'white';

    if (gameMode === '1p') {
        if (isWhite) {
            status.textContent = '\u25b2  Your Turn';
            status.classList.remove('thinking');
        } else {
            status.textContent = '\u25bd  Computer Thinking\u2026';
            status.classList.add('thinking');
        }
    } else {
        status.textContent = isWhite ? '\u25b2  White\u2019s Turn' : '\u25bd  Black\u2019s Turn';
        status.classList.remove('thinking');
    }

    status.style.background = isWhite ? '#f0d9b5' : '#1c1a18';
    status.style.color      = isWhite ? '#1a1a1a' : '#f0d9b5';
}

function updatePlayerLabels() {
    const opp  = document.getElementById('opponent-label');
    const self = document.getElementById('self-label');
    if (opp)  opp.textContent  = gameMode === '1p' ? 'Black \u2014 Computer' : 'Black \u2014 Player 2';
    if (self) self.textContent = gameMode === '1p' ? 'White \u2014 You'      : 'White \u2014 Player 1';
}

function toggleGameMode() {
    gameMode = gameMode === '1p' ? '2p' : '1p';
    const btn = document.getElementById('mode-toggle-btn');
    if (btn) btn.textContent = gameMode === '1p' ? 'vs Computer' : 'Two Player';
    initializeBoard();
}

// ════════════════════════════════════════════════════════
//  AI — Grandmaster-level Iterative Deepening Alpha-Beta
//
//  Core algorithms:
//   - Minimax with alpha-beta pruning
//   - Transposition Table (exact / lower / upper bounds)
//   - Iterative deepening with PV move ordering
//   - Quiescence search (captures + promotions, depth up to QMAX)
//   - Killer move heuristic (2 slots per ply)
//   - History heuristic (depth^2 bonus on beta cutoffs)
//   - Late Move Reduction (LMR) — search quiet moves 4+ at reduced depth
//   - Tempo-aware evaluation (whose turn shifts the race score by 1)
//
//  Strategic evaluation (black's perspective):
//   1. PASSED PIECES  — exact interception theorem:
//      white at (wr,wc) intercepts black at (br,bc) IFF wr>br AND |wc-bc|<=wr-br
//   2. RACE           — who promotes first, tempo-adjusted
//   3. DOUBLE THREAT  — two simultaneous passed pieces = decisive
//   4. ADVANCEMENT    — quadratic bonus for proximity to promotion
//   5. MATERIAL       — piece count
// ════════════════════════════════════════════════════════

// ── Board helpers ─────────────────────────────────────────
function getAllMovesFor(bState, player) {
    const moves = [];
    for (let r = 0; r < boardSize; r++)
        for (let c = 0; c < boardSize; c++) {
            if (bState[r][c] !== player) continue;
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const nr = r+dr, nc = c+dc;
                if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize &&
                    bState[nr][nc] !== player)
                    moves.push({ fromRow:r, fromCol:c, toRow:nr, toCol:nc });
            }
        }
    return moves;
}

function applyMoveToBoard(bState, fr, fc, tr, tc) {
    const nb = bState.map(row => row.slice());
    nb[tr][tc] = nb[fr][fc];
    nb[fr][fc] = null;
    return nb;
}

function checkWinner(bState) {
    for (let c = 0; c < boardSize; c++) {
        if (bState[0][c] === 'white') return 'white';
        if (bState[boardSize-1][c] === 'black') return 'black';
    }
    let w = 0, bk = 0;
    for (let r = 0; r < boardSize; r++)
        for (let c = 0; c < boardSize; c++) {
            if (bState[r][c] === 'white') w++;
            else if (bState[r][c] === 'black') bk++;
        }
    if (w  === 0) return 'black';
    if (bk === 0) return 'white';
    return null;
}

// ── Evaluation (tempo-aware) ──────────────────────────────
// isBlack = whose turn it is (used for tempo correction in race).
// Returns score from black's perspective (positive = black winning).
function evaluateBoard(bState, isBlack) {
    const whites = [], blacks = [];
    for (let r = 0; r < boardSize; r++)
        for (let c = 0; c < boardSize; c++) {
            if      (bState[r][c] === 'white') whites.push({ r, c });
            else if (bState[r][c] === 'black') blacks.push({ r, c });
        }

    if (whites.length === 0) return  90000;
    if (blacks.length === 0) return -90000;

    // Effective distance to promotion, penalising blocked columns
    function bEffDist(r, c) {
        const raw = boardSize - 1 - r;
        for (let rr = r + 1; rr < boardSize; rr++)
            if (bState[rr][c] !== null) return raw + 2;
        return raw;
    }
    function wEffDist(r, c) {
        const raw = r;
        for (let rr = r - 1; rr >= 0; rr--)
            if (bState[rr][c] !== null) return raw + 2;
        return raw;
    }

    const bDists = blacks.map(p => bEffDist(p.r, p.c));
    const wDists = whites.map(p => wEffDist(p.r, p.c));
    const bMin   = Math.min(...bDists);
    const wMin   = Math.min(...wDists);

    // Tempo: the side to move effectively has 1 fewer move to promotion
    const bAdj = isBlack ? 0 : 1;
    const wAdj = isBlack ? 1 : 0;

    let score = 0;

    // 1. Race (tempo-corrected)
    score += ((wMin + wAdj) - (bMin + bAdj)) * 300;

    // 2. Passed pieces (exact interception theorem)
    let bPassed = 0;
    for (let i = 0; i < blacks.length; i++) {
        const { r: br, c: bc } = blacks[i];
        let blocked = false;
        for (const { r: wr, c: wc } of whites) {
            if (wr > br && Math.abs(wc - bc) <= wr - br) { blocked = true; break; }
        }
        if (!blocked) {
            bPassed++;
            // Extra bonus the closer it is to promotion
            score += 1500 + (boardSize - 1 - bDists[i]) * 220;
        }
    }
    if (bPassed >= 2) score += 3200;   // double threat = decisive

    let wPassed = 0;
    for (let i = 0; i < whites.length; i++) {
        const { r: wr, c: wc } = whites[i];
        let blocked = false;
        for (const { r: br, c: bc } of blacks) {
            if (br < wr && Math.abs(bc - wc) <= wr - br) { blocked = true; break; }
        }
        if (!blocked) {
            wPassed++;
            score -= 1500 + (boardSize - 1 - wDists[i]) * 220;
        }
    }
    if (wPassed >= 2) score -= 3200;

    // 3. Quadratic advancement bonus
    for (const { r } of blacks) score += r * r * 2;
    for (const { r } of whites) score -= (boardSize - 1 - r) * (boardSize - 1 - r) * 2;

    // 4. Near-promotion urgency + clear lane
    for (const { r, c } of blacks) {
        if      (r === boardSize - 2) score += 520;
        else if (r === boardSize - 3) score += 140;
        else if (r === boardSize - 4) score +=  38;
        let clear = true;
        for (let rr = r + 1; rr < boardSize; rr++)
            if (bState[rr][c]) { clear = false; break; }
        if (clear) score += 50;
    }
    for (const { r, c } of whites) {
        if      (r === 1) score -= 520;
        else if (r === 2) score -= 140;
        else if (r === 3) score -=  38;
        let clear = true;
        for (let rr = 0; rr < r; rr++)
            if (bState[rr][c]) { clear = false; break; }
        if (clear) score -= 50;
    }

    // 5. Material — weight scales up when losing the race so the AI trades
    //    actively to dismantle the opponent's threats instead of just racing.
    const raceDiff = (wMin + wAdj) - (bMin + bAdj); // positive = black ahead
    const matWeight = raceDiff < -1
        ? 90 + Math.min(260, (-raceDiff - 1) * 50)  // up to 350 when badly behind
        : 90;
    score += (blacks.length - whites.length) * matWeight;

    // 6. Bonus for eliminating white's unblocked (passed) pieces.
    //    If white has wPassed > bPassed, each white piece with a clear lane
    //    to row-0 is an active threat; capturing it is worth extra.
    if (wPassed > bPassed) {
        for (let i = 0; i < whites.length; i++) {
            let clear = true;
            for (let rr = whites[i].r - 1; rr >= 0; rr--)
                if (bState[rr][whites[i].c]) { clear = false; break; }
            // Reward positions where this threat piece is gone (already captured),
            // which shows up as a reward when the search actually removes it.
            // Here we add a "danger" penalty so the search values its removal.
            if (clear) score -= 180 + (boardSize - 1 - wDists[i]) * 60;
        }
    }

    return score;
}

// ── Transposition Table ───────────────────────────────────
const TT = new Map();
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

function ttKey(bState, isBlack) {
    let k = isBlack ? 'B' : 'W';
    for (let r = 0; r < boardSize; r++)
        for (let c = 0; c < boardSize; c++)
            k += bState[r][c] === 'black' ? '1' : bState[r][c] === 'white' ? '2' : '0';
    return k;
}

// ── Killer moves (2 slots per ply) ───────────────────────
let _killers = [];   // _killers[depth] = [move0, move1]

function sameMove(a, b) {
    return a && b &&
        a.fromRow === b.fromRow && a.fromCol === b.fromCol &&
        a.toRow   === b.toRow   && a.toCol   === b.toCol;
}

function storeKiller(m, depth) {
    if (!_killers[depth]) { _killers[depth] = [m, null]; return; }
    if (sameMove(_killers[depth][0], m)) return;
    _killers[depth][1] = _killers[depth][0];
    _killers[depth][0] = m;
}

// ── History heuristic ─────────────────────────────────────
let _history = {};   // key -> cumulative score

function histKey(m) {
    return `${m.fromRow}${m.fromCol}${m.toRow}${m.toCol}`;
}

function addHistory(m, depth) {
    const k = histKey(m);
    _history[k] = (_history[k] || 0) + depth * depth;
}

// ── Move ordering score ───────────────────────────────────
function moveScore(bState, m, isBlack, depth) {
    let v = 0;
    const isCapture = !!bState[m.toRow][m.toCol];

    if (isCapture) {
        v += 10000;
        // Prefer capturing the most advanced (most dangerous) enemy piece
        if (isBlack) v += (boardSize - 1 - m.toRow) * 100;
        else         v += m.toRow * 100;

        // Extra priority for capturing a piece with a clear lane to promotion
        // (i.e. an unblocked threat that is actively dangerous)
        if (isBlack) {
            let clear = true;
            for (let rr = m.toRow - 1; rr >= 0; rr--)
                if (bState[rr][m.toCol]) { clear = false; break; }
            if (clear) v += 1800 + (boardSize - 1 - m.toRow) * 150;
        } else {
            let clear = true;
            for (let rr = m.toRow + 1; rr < boardSize; rr++)
                if (bState[rr][m.toCol]) { clear = false; break; }
            if (clear) v += 1800 + m.toRow * 150;
        }
    }

    // Check promotion-threat move (moving to penultimate row)
    if (isBlack && m.toRow === boardSize - 2) v += 5000;
    if (!isBlack && m.toRow === 1)            v += 5000;

    if (!isCapture) {
        // Killer moves (quiet moves that caused a cutoff at same depth)
        const k = _killers[depth];
        if (k) {
            if (sameMove(k[0], m)) v += 4000;
            else if (sameMove(k[1], m)) v += 3500;
        }

        // History heuristic
        v += (_history[histKey(m)] || 0);
    }

    // Forward movement preference
    if (isBlack) {
        if (m.toRow > m.fromRow) v += 800;
        v += m.toRow * 12;
        // Blocking: land directly above an advancing white piece
        const wb = m.toRow + 1;
        if (wb < boardSize && bState[wb][m.toCol] === 'white')
            v += 950 + (boardSize - 1 - wb) * 80;
    } else {
        if (m.toRow < m.fromRow) v += 800;
        v += (boardSize - 1 - m.toRow) * 12;
        const bb = m.toRow - 1;
        if (bb >= 0 && bState[bb][m.toCol] === 'black')
            v += 950 + bb * 80;
    }

    return v;
}

// ── Quiescence search ─────────────────────────────────────
// Only considers captures and promotion moves to avoid the horizon effect.
const QMAX = 8;

function qMoveScore(bState, m, isBlack) {
    let v = 0;
    if (bState[m.toRow][m.toCol]) {
        v += 10000;
        if (isBlack) v += (boardSize - 1 - m.toRow) * 100;
        else         v += m.toRow * 100;
    }
    if (isBlack  && m.toRow === boardSize - 2) v += 5000;
    if (!isBlack && m.toRow === 1)             v += 5000;
    return v;
}

function qsearch(bState, alpha, beta, isBlack, qd) {
    const winner = checkWinner(bState);
    if (winner === 'black') return  100000;
    if (winner === 'white') return -100000;

    // Stand-pat score
    const standPat = evaluateBoard(bState, isBlack);
    if (qd >= QMAX) return standPat;

    if (isBlack) {
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (standPat < beta)  beta  = standPat;
    }

    // Generate only tactical moves (captures + near-promotion)
    const player = isBlack ? 'black' : 'white';
    const allMoves = getAllMovesFor(bState, player);
    const tactical = allMoves.filter(m => {
        if (bState[m.toRow][m.toCol]) return true;            // capture
        if (isBlack  && m.toRow === boardSize - 2) return true; // one step from promotion
        if (!isBlack && m.toRow === 1)             return true;
        return false;
    });

    if (tactical.length === 0) return standPat;

    tactical.sort((a, b) => qMoveScore(bState, b, isBlack) - qMoveScore(bState, a, isBlack));

    if (isBlack) {
        let best = standPat;
        for (const m of tactical) {
            const nb = applyMoveToBoard(bState, m.fromRow, m.fromCol, m.toRow, m.toCol);
            const sc = qsearch(nb, alpha, beta, false, qd + 1);
            if (sc > best) best = sc;
            if (sc > alpha) alpha = sc;
            if (alpha >= beta) break;
        }
        return best;
    } else {
        let best = standPat;
        for (const m of tactical) {
            const nb = applyMoveToBoard(bState, m.fromRow, m.fromCol, m.toRow, m.toCol);
            const sc = qsearch(nb, alpha, beta, true, qd + 1);
            if (sc < best) best = sc;
            if (sc < beta) beta = sc;
            if (alpha >= beta) break;
        }
        return best;
    }
}

// ── Alpha-beta minimax with TT + killers + history + LMR ──
function minimax(bState, depth, alpha, beta, isBlack) {
    const origAlpha = alpha;
    const origBeta  = beta;

    const winner = checkWinner(bState);
    if (winner === 'black') return  100000 + depth;
    if (winner === 'white') return -100000 - depth;

    // At depth 0 drop into quiescence search
    if (depth === 0) return qsearch(bState, alpha, beta, isBlack, 0);

    const key = ttKey(bState, isBlack);
    const tt  = TT.get(key);
    let ttMove = null;
    if (tt) {
        ttMove = tt.bm || null;
        if (tt.d >= depth) {
            if (tt.f === TT_EXACT) return tt.v;
            if (tt.f === TT_LOWER) alpha = Math.max(alpha, tt.v);
            if (tt.f === TT_UPPER) beta  = Math.min(beta,  tt.v);
            if (alpha >= beta) return tt.v;
        }
    }

    // Null move pruning — disabled for this racing game: passing a turn is
    // catastrophically bad, so null-move assumptions break down and cause
    // the AI to miss critical defensive (blocking) moves.

    const player = isBlack ? 'black' : 'white';
    const moves  = getAllMovesFor(bState, player);
    if (moves.length === 0) return isBlack ? -55000 : 55000;

    // Move ordering: TT best > captures/promotions > killers > history > forward
    moves.sort((a, b) => {
        const aIsTT = ttMove && sameMove(a, ttMove);
        const bIsTT = ttMove && sameMove(b, ttMove);
        if (aIsTT && !bIsTT) return -1;
        if (bIsTT && !aIsTT) return  1;
        return moveScore(bState, b, isBlack, depth) - moveScore(bState, a, isBlack, depth);
    });

    let best     = isBlack ? -Infinity : Infinity;
    let bestMove = null;

    for (let mi = 0; mi < moves.length; mi++) {
        const m  = moves[mi];
        const nb = applyMoveToBoard(bState, m.fromRow, m.fromCol, m.toRow, m.toCol);
        const isCapture = !!bState[m.toRow][m.toCol];

        let sc;

        // Late Move Reduction: search quiet moves beyond index 2 at depth-2 first
        const doLMR = mi >= 2 && depth >= 3 && !isCapture;
        if (doLMR) {
            const reduced = minimax(nb, depth - 2, alpha, beta, !isBlack);
            // Only do a full re-search if the reduced search looks interesting
            if ((isBlack && reduced > alpha) || (!isBlack && reduced < beta)) {
                sc = minimax(nb, depth - 1, alpha, beta, !isBlack);
            } else {
                sc = reduced;
            }
        } else {
            sc = minimax(nb, depth - 1, alpha, beta, !isBlack);
        }

        if (isBlack) {
            if (sc > best) { best = sc; bestMove = m; }
            if (sc > alpha) alpha = sc;
        } else {
            if (sc < best) { best = sc; bestMove = m; }
            if (sc < beta)  beta  = sc;
        }

        if (beta <= alpha) {
            // Beta cutoff — store killer and history for quiet moves
            if (!isCapture && bestMove) {
                storeKiller(bestMove, depth);
                addHistory(bestMove, depth);
            }
            break;
        }
    }

    const flag = best <= origAlpha ? TT_UPPER : best >= origBeta ? TT_LOWER : TT_EXACT;
    TT.set(key, { v: best, d: depth, f: flag, bm: bestMove });
    return best;
}

// ── Root search: iterative deepening ─────────────────────
function makeBlackMove() {
    const moves = getAllMovesFor(board, 'black');
    if (moves.length === 0) {
        currentPlayer = 'white';
        renderBoard();
        updateGameStatus();
        return;
    }

    // Reset per-search tables
    TT.clear();
    _killers = [];
    _history = {};

    // Initial move ordering by heuristic
    moves.sort((a, b) => moveScore(board, b, true, 1) - moveScore(board, a, true, 1));

    const TIME_MS = 1200;
    const t0      = Date.now();
    let bestMove  = moves[0];

    for (let depth = 1; depth <= 18; depth++) {
        if (depth > 2 && Date.now() - t0 > TIME_MS * 0.50) break;

        let iterBest  = null;
        let iterScore = -Infinity;
        let rootAlpha = -Infinity;

        for (const m of moves) {
            const nb = applyMoveToBoard(board, m.fromRow, m.fromCol, m.toRow, m.toCol);
            const sc = minimax(nb, depth - 1, rootAlpha, Infinity, false);
            if (sc > iterScore) { iterScore = sc; iterBest = m; }
            if (sc > rootAlpha) rootAlpha = sc;
            // If we found a forced win there's no point searching deeper moves at this depth
            if (iterScore >= 99000) break;
        }

        if (iterBest) {
            bestMove = iterBest;
            // PV move ordering: bring best move to front for next iteration
            const idx = moves.indexOf(iterBest);
            if (idx > 0) { moves.splice(idx, 1); moves.unshift(iterBest); }
        }

        if (iterScore >= 99000) break;  // forced win — stop
    }

    movePiece(bestMove.fromRow, bestMove.fromCol, bestMove.toRow, bestMove.toCol);
}

// ── Keyboard helpers ──────────────────────────────────────
function getPlayerPieces(player) {
    const pieces = [];
    for (let r = 0; r < boardSize; r++)
        for (let c = 0; c < boardSize; c++)
            if (board[r][c] === player) pieces.push({ row: r, col: c });
    return pieces;
}

function autoSelectFirstPiece() {
    const pieces = getPlayerPieces(currentPlayer);
    if (pieces.length === 0) return;

    // Prefer the piece that was last moved by this color
    const last = _lastMovedTo[currentPlayer];
    const lastIdx = last
        ? pieces.findIndex(p => p.row === last.row && p.col === last.col)
        : -1;

    _kbPieceIdx   = lastIdx >= 0 ? lastIdx : 0;
    selectedPiece = pieces[_kbPieceIdx];
    renderBoard();
}

// ── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('touchmove', function (e) {
        if (e.target.closest('#game-board')) e.preventDefault();
    }, { passive: false });

    document.getElementById('instructions-btn')
        ?.addEventListener('click', () => document.getElementById('instructions-popup').classList.remove('hidden'));
    document.getElementById('close-instructions-btn')
        ?.addEventListener('click', () => document.getElementById('instructions-popup').classList.add('hidden'));
    document.getElementById('mode-toggle-btn')
        ?.addEventListener('click', toggleGameMode);
    document.getElementById('reset-btn')
        ?.addEventListener('click', initializeBoard);

    // ── Keyboard navigation ───────────────────────────────
    const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const ARROW_DIR  = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] };

    document.addEventListener('keydown', (e) => {
        if (!ARROW_KEYS.includes(e.key)) return;

        // Only act on the human player's turn
        const isPlayerTurn = currentPlayer === 'white' ||
                             (gameMode === '2p' && currentPlayer === 'black');
        if (!isPlayerTurn) return;

        e.preventDefault();

        if (e.shiftKey) {
            // Shift+Arrow: jump to the geometrically nearest piece in that direction
            const pieces = getPlayerPieces(currentPlayer);
            if (pieces.length === 0) return;

            const cur = selectedPiece || pieces[0];
            let best = null, bestDist = Infinity;

            for (const p of pieces) {
                if (p.row === cur.row && p.col === cur.col) continue;
                const colDiff = p.col - cur.col;
                const rowDiff = p.row - cur.row;

                let inDir = false;
                if (e.key === 'ArrowLeft')  inDir = colDiff < 0;
                if (e.key === 'ArrowRight') inDir = colDiff > 0;
                if (e.key === 'ArrowUp')    inDir = rowDiff < 0;
                if (e.key === 'ArrowDown')  inDir = rowDiff > 0;
                if (!inDir) continue;

                // Primary distance = column (or row) distance; secondary = the other axis
                const primary   = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
                    ? Math.abs(colDiff) : Math.abs(rowDiff);
                const secondary = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
                    ? Math.abs(rowDiff) : Math.abs(colDiff);
                const dist = primary * 100 + secondary;

                if (dist < bestDist) { bestDist = dist; best = p; }
            }

            // Wrap: jump to the extreme opposite end
            if (!best) {
                const isHoriz = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
                // Left → wrap to rightmost; Right → wrap to leftmost
                // Up   → wrap to bottommost; Down → wrap to topmost
                const wantMax = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
                for (const p of pieces) {
                    if (p.row === cur.row && p.col === cur.col) continue;
                    if (!best) { best = p; continue; }
                    const val     = isHoriz ? p.col     : p.row;
                    const bestVal = isHoriz ? best.col  : best.row;
                    if (wantMax ? val > bestVal : val < bestVal) best = p;
                }
            }

            if (best) {
                selectedPiece = best;
                _kbPieceIdx = pieces.findIndex(p => p.row === best.row && p.col === best.col);
                renderBoard();
            }
        } else if (selectedPiece) {
            // Arrow (no shift): move selected piece
            const [dr, dc] = ARROW_DIR[e.key];
            const toRow = selectedPiece.row + dr;
            const toCol = selectedPiece.col + dc;
            if (toRow >= 0 && toRow < boardSize &&
                toCol >= 0 && toCol < boardSize &&
                isValidMove(selectedPiece.row, selectedPiece.col, toRow, toCol)) {
                movePiece(selectedPiece.row, selectedPiece.col, toRow, toCol);
                _kbPieceIdx = 0;
            }
        }
    });
});

window.onload = function () { initializeBoard(); };
