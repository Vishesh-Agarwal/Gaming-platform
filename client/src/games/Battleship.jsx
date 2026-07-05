import { useEffect, useMemo, useState } from 'react';
import carrierImg from '../assets/battleship/carrier.png';
import battleshipImg from '../assets/battleship/battleship.png';
import destroyerImg from '../assets/battleship/destroyer.png';
import submarineImg from '../assets/battleship/submarine.png';
import patrolImg from '../assets/battleship/patrol.png';
import carrierVImg from '../assets/battleship/carrier-v.png';
import battleshipVImg from '../assets/battleship/battleship-v.png';
import destroyerVImg from '../assets/battleship/destroyer-v.png';
import submarineVImg from '../assets/battleship/submarine-v.png';
import patrolVImg from '../assets/battleship/patrol-v.png';

const ORIENT_LABEL = { h: 'Horizontal', v: 'Vertical' };
const SHIP_IMAGES = {
  carrier: { h: carrierImg, v: carrierVImg },
  battleship: { h: battleshipImg, v: battleshipVImg },
  destroyer: { h: destroyerImg, v: destroyerVImg },
  submarine: { h: submarineImg, v: submarineVImg },
  patrol: { h: patrolImg, v: patrolVImg },
};

const cellKey = (x, y) => `${x},${y}`;

function makeDefaultPlacements(fleet) {
  return fleet.map((ship, row) => ({
    id: ship.id,
    x: 0,
    y: row,
    dir: 'h',
  }));
}

function randomPlacements(fleet, size) {
  const occupied = new Set();
  const out = [];
  for (const ship of fleet) {
    for (let tries = 0; tries < 200; tries += 1) {
      const dir = Math.random() > 0.5 ? 'h' : 'v';
      const x = Math.floor(Math.random() * (dir === 'h' ? size - ship.size + 1 : size));
      const y = Math.floor(Math.random() * (dir === 'v' ? size - ship.size + 1 : size));
      const place = { id: ship.id, x, y, dir };
      const cells = cellsFor(place, fleet);
      if (cells.every((c) => !occupied.has(cellKey(c.x, c.y)))) {
        cells.forEach((c) => occupied.add(cellKey(c.x, c.y)));
        out.push(place);
        break;
      }
    }
  }
  return out.length === fleet.length ? out : makeDefaultPlacements(fleet);
}

function cellsFor(place, fleet) {
  const spec = fleet.find((ship) => ship.id === place.id);
  if (!spec) return [];
  return Array.from({ length: spec.size }, (_, i) => ({
    x: place.x + (place.dir === 'h' ? i : 0),
    y: place.y + (place.dir === 'v' ? i : 0),
  }));
}

function shipMap(ships) {
  const map = new Map();
  for (const ship of ships || []) {
    const cells = ship.cells || [];
    const dir = cells.length > 1 && cells[0].x === cells[1].x ? 'v' : 'h';
    const ordered = cells.slice().sort((a, b) => (dir === 'h' ? a.x - b.x : a.y - b.y));
    for (const c of cells) {
      const index = ordered.findIndex((p) => p.x === c.x && p.y === c.y);
      const part = index === 0 ? 'bow' : index === ordered.length - 1 ? 'stern' : 'mid';
      map.set(cellKey(c.x, c.y), { ship, dir, index, part, length: ordered.length });
    }
  }
  return map;
}

function shipModels(ships) {
  return (ships || []).map((ship) => {
    const cells = ship.cells || [];
    const dir = cells.length > 1 && cells[0].x === cells[1].x ? 'v' : 'h';
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      id: ship.id,
      name: ship.name || ship.id,
      dir,
      x,
      y,
      span: cells.length,
      hits: ship.hits?.length || 0,
      sunk: ship.hits?.length >= cells.length && cells.length > 0,
    };
  }).filter((ship) => Number.isFinite(ship.x) && Number.isFinite(ship.y) && ship.span > 0);
}

function shotMap(shots) {
  return new Map((shots || []).map((shot) => [cellKey(shot.x, shot.y), shot]));
}

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || 'Opponent';
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#162433" />
      <g stroke="#29445f" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={20 + i * 10} y1="18" x2={20 + i * 10} y2="100" />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="18" y1={20 + i * 10} x2="100" y2={20 + i * 10} />)}
      </g>
      <rect x="26" y="38" width="42" height="10" rx="5" fill="#8fa7bd" />
      <rect x="58" y="70" width="10" height="25" rx="5" fill="#caa46a" />
      <circle cx="83" cy="38" r="7" fill="#e85f70" />
      <circle cx="37" cy="81" r="5" fill="#3fc7ad" />
    </svg>
  );
}

function Grid({ size, ships = [], shots = [], scans = [], lastShot = null, pending = [], onCell, disabled, label, scanMode }) {
  const shipsByCell = useMemo(() => shipMap(ships), [ships]);
  const models = useMemo(() => shipModels(ships), [ships]);
  const shotsByCell = useMemo(() => shotMap(shots), [shots]);
  const scansByCell = useMemo(() => new Map((scans || []).map((scan) => [cellKey(scan.x, scan.y), scan])), [scans]);
  // In salvo mode the last shot is a whole volley; highlight every cell of it.
  const lastShotKeys = useMemo(() => {
    if (!lastShot) return new Set();
    if (Array.isArray(lastShot.salvo)) return new Set(lastShot.salvo.map((s) => cellKey(s.x, s.y)));
    return new Set([cellKey(lastShot.x, lastShot.y)]);
  }, [lastShot]);
  const pendingByCell = useMemo(() => new Map(pending.map((c, i) => [cellKey(c.x, c.y), i + 1])), [pending]);
  return (
    <div className="bs-grid-wrap">
      <span className="bs-grid-label">{label}</span>
      <div className="bs-grid" style={{ '--bs-size': size }}>
        <div className="bs-ship-layer" aria-hidden>
          {models.map((ship) => (
            <span
              key={`${ship.id}-${ship.x}-${ship.y}-${ship.dir}`}
              className={`bs-vessel ${ship.dir} ${ship.id}${ship.sunk ? ' sunk-vessel' : ''}`}
              style={{
                gridColumn: `${ship.x + 1} / span ${ship.dir === 'h' ? ship.span : 1}`,
                gridRow: `${ship.y + 1} / span ${ship.dir === 'v' ? ship.span : 1}`,
                '--ship-span': ship.span,
                '--ship-hits': ship.hits,
              }}
            >
              <img className="bs-vessel-img" src={SHIP_IMAGES[ship.id]?.[ship.dir]} alt="" draggable="false" />
            </span>
          ))}
        </div>
        {Array.from({ length: size * size }, (_, i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          const shipMeta = shipsByCell.get(cellKey(x, y));
          const shot = shotsByCell.get(cellKey(x, y));
          const scan = scansByCell.get(cellKey(x, y));
          const pendingNo = pendingByCell.get(cellKey(x, y));
          const cls = ['bs-cell'];
          if (shipMeta) cls.push('ship', `ship-${shipMeta.dir}`, `ship-${shipMeta.part}`);
          if (scan) cls.push('scan');
          if (scanMode) cls.push('scan-mode');
          if (pendingNo) cls.push('pending');
          if (lastShotKeys.has(cellKey(x, y))) cls.push('last-shot');
          if (shot) {
            cls.push('targeted');
            cls.push(shot.result === 'miss' ? 'miss' : shot.result === 'sunk' ? 'sunk' : 'hit');
          }
          return (
            <button
              key={`${x}-${y}`}
              type="button"
              className={cls.join(' ')}
              disabled={disabled || !!shot}
              onClick={() => onCell?.(x, y)}
              onDragOver={(e) => onCell && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const shipId = e.dataTransfer.getData('text/plain');
                if (shipId && onCell) onCell(x, y, shipId);
              }}
              aria-label={`${label} ${x + 1},${y + 1}`}
            >
              <span className="bs-water" aria-hidden />
              {pendingNo && <span className="bs-pending-mark">{pendingNo}</span>}
              {scan && <span className="bs-scan-count">{scan.ships}</span>}
              {shot?.result === 'miss' && <span className="bs-shot-mark miss-mark">•</span>}
              {shot && shot.result !== 'miss' && <span className="bs-shot-mark hit-mark">×</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Battleship({ room, youAreIndex, onMove }) {
  const state = room.state;
  const [placements, setPlacements] = useState(() => makeDefaultPlacements(state.fleet));
  const [selected, setSelected] = useState(state.fleet[0]?.id || null);
  const [dir, setDir] = useState('h');
  const [scanMode, setScanMode] = useState(false);
  const [pending, setPending] = useState([]);
  const opponent = youAreIndex === 0 ? 1 : 0;
  const myReady = !!state.ready?.[youAreIndex];
  const myTurn = state.phase === 'playing' && state.turn === youAreIndex && room.status === 'playing';
  const salvoMode = state.mode === 'salvo';
  const salvoSize = (state.ownBoard?.ships || [])
    .filter((ship) => (ship.hits?.length || 0) < (ship.cells?.length || 0)).length;

  // A new server state means the volley resolved (or the turn changed) — reset picks.
  useEffect(() => { setPending([]); }, [state.seq]);

  const togglePending = (x, y) => {
    setPending((prev) => {
      const without = prev.filter((c) => !(c.x === x && c.y === y));
      if (without.length !== prev.length) return without;
      return prev.length >= salvoSize ? prev : [...prev, { x, y }];
    });
  };

  const setupShips = placements.map((place) => ({
    id: place.id,
    cells: cellsFor(place, state.fleet),
  }));
  const setupValid = setupShips.every((ship) =>
    ship.cells.length === state.fleet.find((s) => s.id === ship.id)?.size
    && ship.cells.every((c) => c.x >= 0 && c.y >= 0 && c.x < state.size && c.y < state.size)
  ) && new Set(setupShips.flatMap((ship) => ship.cells.map((c) => cellKey(c.x, c.y)))).size === setupShips.reduce((n, s) => n + s.cells.length, 0);

  const placeSelected = (x, y, shipId = selected) => {
    if (myReady || state.phase !== 'setup' || !shipId) return;
    setSelected(shipId);
    setPlacements((prev) => prev.map((p) => (p.id === shipId ? { ...p, x, y, dir } : p)));
  };

  const onCellDragStart = (event, shipId) => {
    event.dataTransfer.setData('text/plain', shipId);
  };

  const status = () => {
    if (room.status === 'over') return 'Battle complete';
    if (state.phase === 'setup') return myReady ? 'Waiting for opponent fleet' : 'Place your fleet';
    if (myTurn) return salvoMode ? `Pick ${salvoSize} salvo targets` : 'Your shot';
    return `${playerName(room, opponent, youAreIndex)} is targeting`;
  };

  return (
    <div className="bs">
      <div className="bs-bridge">
        <span className="bs-kicker">Battleship</span>
        <h3>{status()}</h3>
        <div className="bs-status-row">
          <span>{playerName(room, youAreIndex, youAreIndex)} hits: <b>{state.scores?.[youAreIndex] || 0}</b></span>
          <span>{playerName(room, opponent, youAreIndex)} hits: <b>{state.scores?.[opponent] || 0}</b></span>
        </div>
      </div>

      {state.phase === 'setup' && !myReady && (
        <div className="bs-setup">
          <div className="bs-fleet">
            {state.fleet.map((ship) => (
              <button
                key={ship.id}
                type="button"
                className={selected === ship.id ? 'active' : ''}
                onClick={() => setSelected(ship.id)}
                draggable
                onDragStart={(e) => onCellDragStart(e, ship.id)}
              >
                <span>{ship.name}</span>
                <b>{ship.size}</b>
              </button>
            ))}
            <button type="button" className="ghost" onClick={() => setDir((d) => (d === 'h' ? 'v' : 'h'))}>
              {ORIENT_LABEL[dir]}
            </button>
            <button type="button" className="ghost" onClick={() => setPlacements(randomPlacements(state.fleet, state.size))}>Randomize</button>
            <button disabled={!setupValid} onClick={() => onMove({ type: 'place', ships: setupShips })}>Ready fleet</button>
          </div>
          <Grid size={state.size} ships={setupShips} shots={[]} onCell={placeSelected} label="Fleet setup" />
        </div>
      )}

      {(state.phase !== 'setup' || myReady) && (
        <div className="bs-theater">
          <Grid
            size={state.size}
            ships={state.ownBoard?.ships || []}
            shots={state.incomingShots || []}
            lastShot={state.lastShot?.by !== youAreIndex ? state.lastShot : null}
            disabled
            label="Your waters"
          />
          <Grid
            size={state.size}
            ships={state.revealedEnemyShips || []}
            shots={state.targetShots || []}
            scans={state.targetScans || []}
            lastShot={state.lastShot?.by === youAreIndex ? state.lastShot : null}
            pending={pending}
            disabled={!myTurn}
            scanMode={scanMode}
            onCell={(x, y) => {
              if (scanMode) {
                onMove({ type: 'scan', x, y });
                setScanMode(false);
              } else if (salvoMode) {
                togglePending(x, y);
              } else {
                onMove({ type: 'fire', x, y });
              }
            }}
            label="Target grid"
          />
          <div className="bs-actions">
            <button className={scanMode ? '' : 'ghost'} disabled={!myTurn || (state.scans?.[youAreIndex] || 0) <= 0} onClick={() => setScanMode((v) => !v)}>
              Radar {state.scans?.[youAreIndex] || 0}
            </button>
            {salvoMode && (
              <button
                className="bs-salvo-fire"
                disabled={!myTurn || pending.length !== salvoSize}
                onClick={() => onMove({ type: 'salvo', cells: pending })}
              >
                Fire salvo {pending.length}/{salvoSize}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
