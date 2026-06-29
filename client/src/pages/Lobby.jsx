// Main page: top bar, games grid (center), narrow chat (right).
// Clicking a game opens the invite/add-friend modal.
import { useEffect, useState } from 'react';
import { availableGames } from '../games/registry.js';
import { listMaps } from '../games/karts/kartMaps.js';
import { APP_NAME } from '../config.js';
import GameCard from '../components/GameCard.jsx';
import InviteModal from '../components/InviteModal.jsx';
import LobbyModal from '../components/LobbyModal.jsx';
import FriendsChat from '../components/FriendsChat.jsx';
import Modal from '../components/Modal.jsx';

// Chat panel width: default bumped +10% again (352 -> 387), user-resizable + persisted.
const CHAT_WIDTH_KEY = 'gp-chat-width-v2';
const DEFAULT_CHAT_WIDTH = 387;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 680;

export default function Lobby({
  friends,
  onlineIds,
  requests,
  invites,
  selectedFriendId,
  conversations,
  unread,
  currentUser,
  notice,
  lobby,
  lobbyInvites,
  onAddFriend,
  onAccept,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCreateLobby,
  onQuickPlay,
  onJoinLobby,
  onShowRooms,
  publicLobbies,
  roomsOpen,
  onCloseRooms,
  onLeaveLobby,
  onLobbyReady,
  onSetLobbyMap,
  onSetLobbyMode,
  onSetLobbyOption,
  onSetLobbyBots,
  onSetLobbyTeam,
  onInviteToLobby,
  onStartLobby,
  onSelectFriend,
  onBack,
  onSendChat,
  onLogout,
  onShowStats,
  stats,
  statsOpen,
  onCloseStats,
}) {
  const [pickedGame, setPickedGame] = useState(null); // game chosen to invite into
  const [showAdd, setShowAdd] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [addName, setAddName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Clicking a game: multiplayer games open a lobby, 1v1 games open the invite modal.
  const pickGame = (g) => (g.maxPlayers > 2 ? onCreateLobby(g.id) : setPickedGame(g));

  const submitJoinCode = (e) => {
    e.preventDefault();
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return;
    onJoinLobby({ code: c });
    setJoinCode('');
    setShowJoinCode(false);
  };

  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    return saved >= MIN_CHAT_WIDTH && saved <= MAX_CHAT_WIDTH ? saved : DEFAULT_CHAT_WIDTH;
  });
  useEffect(() => {
    localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
  }, [chatWidth]);

  // Drag the divider to resize the chat panel (it's anchored to the right edge).
  const startResize = (e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const next = window.innerWidth - ev.clientX;
      setChatWidth(Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, next)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const submitAdd = (e) => {
    e.preventDefault();
    const n = addName.trim();
    if (!n) return;
    onAddFriend(n);
    setAddName('');
    setShowAdd(false);
  };

  return (
    <div className="app">
      {/* Incoming game + lobby invites — float on top, hard to miss */}
      {(invites.length > 0 || lobbyInvites?.length > 0) && (
        <div className="invite-banner">
          {invites.map((inv) => (
            <div key={inv.inviteId} className="invite-card">
              <span>
                <b>{inv.from.username}</b> invited you to <b>{inv.gameName}</b>
              </span>
              <div className="invite-actions">
                <button onClick={() => onAcceptInvite(inv.inviteId)}>Accept</button>
                <button className="ghost" onClick={() => onDeclineInvite(inv.inviteId)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
          {lobbyInvites?.map((inv) => (
            <div key={inv.lobbyId} className="invite-card">
              <span>
                <b>{inv.from.username}</b> invited you to a <b>{inv.gameName}</b> lobby
              </span>
              <div className="invite-actions">
                <button onClick={() => onJoinLobby({ lobbyId: inv.lobbyId })}>Join</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <header className="topbar">
        <span className="brand">🎮 {APP_NAME}</span>
        <span className="spacer" />
        <button className="ghost" onClick={() => setShowJoinCode(true)}>
          Join code
        </button>
        <button className="ghost" onClick={onShowRooms}>
          Open rooms
        </button>
        <button className="ghost" onClick={() => setShowAdd(true)}>
          + Add friend
        </button>
        <button className="ghost requests-btn" onClick={() => setShowRequests(true)}>
          Requests
          {requests.length > 0 && <span className="badge">{requests.length}</span>}
        </button>
        <button className="ghost" onClick={onShowStats}>
          Stats
        </button>
        <span className="username">{currentUser.username}</span>
        <button className="link" onClick={onLogout}>
          Log out
        </button>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <div className="app-body" style={{ '--chat-w': `${chatWidth}px` }}>
        <main className="games-area">
          <h2>Games</h2>
          <p className="muted">Pick a game to invite a friend, or hit Quick Play to open a lobby, match with players, or add bots.</p>
          <div className="games-grid">
            {availableGames.map((g) => (
              <GameCard key={g.id} game={g} onClick={pickGame} onQuickPlay={(game) => onQuickPlay(game.id)} />
            ))}
          </div>
        </main>

        <div
          className="resizer"
          onMouseDown={startResize}
          title="Drag to resize chat"
          role="separator"
          aria-orientation="vertical"
        />

        <aside className="chat-side">
          <FriendsChat
            friends={friends}
            onlineIds={onlineIds}
            unread={unread}
            selectedFriendId={selectedFriendId}
            onSelectFriend={onSelectFriend}
            onBack={onBack}
            conversations={conversations}
            currentUser={currentUser}
            onSendChat={onSendChat}
          />
        </aside>
      </div>

      {pickedGame && (
        <InviteModal
          game={pickedGame}
          friends={friends}
          onlineIds={onlineIds}
          onInvite={onInvite}
          onAddFriend={onAddFriend}
          onClose={() => setPickedGame(null)}
        />
      )}

      {lobby && (
        <LobbyModal
          lobby={lobby}
          currentUser={currentUser}
          friends={friends}
          onlineIds={onlineIds}
          onInvite={onInviteToLobby}
          onReady={onLobbyReady}
          onStart={onStartLobby}
          onLeave={onLeaveLobby}
          maps={lobby.gameId === 'karts' ? listMaps() : null}
          onSetMap={onSetLobbyMap}
          modes={availableGames.find((g) => g.id === lobby.gameId)?.modes || null}
          options={availableGames.find((g) => g.id === lobby.gameId)?.options || null}
          onSetMode={onSetLobbyMode}
          onSetOption={onSetLobbyOption}
          onSetBots={onSetLobbyBots}
          botCap={Math.max(0, Math.min(
            availableGames.find((g) => g.id === lobby.gameId)?.botCap || 0,
            lobby.maxPlayers - lobby.members.length
          ))}
          manualTeams={lobby.gameId === 'karts'}
          onSetTeam={onSetLobbyTeam}
        />
      )}

      {showJoinCode && (
        <Modal title="Join by code" onClose={() => setShowJoinCode(false)}>
          <form className="add-friend modal-add" onSubmit={submitJoinCode}>
            <input
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="ROOM CODE"
            />
            <button type="submit" disabled={joinCode.trim().length < 4}>Join</button>
          </form>
        </Modal>
      )}

      {roomsOpen && (
        <Modal title="Open rooms" onClose={onCloseRooms}>
          <div className="room-browser">
            {(!publicLobbies || publicLobbies.length === 0) && <p className="muted">No open rooms right now.</p>}
            {publicLobbies?.map((room) => (
              <div key={room.id} className="room-row">
                <div>
                  <b>{room.gameName}</b>
                  <span>{room.members.length}/{room.maxPlayers} players · {room.code}</span>
                </div>
                <button onClick={() => { onJoinLobby({ lobbyId: room.id }); onCloseRooms(); }}>Join</button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Add a friend" onClose={() => setShowAdd(false)}>
          <form className="add-friend modal-add" onSubmit={submitAdd}>
            <input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Friend's username"
            />
            <button type="submit">Send request</button>
          </form>
        </Modal>
      )}

      {showRequests && (
        <Modal title="Friend requests" onClose={() => setShowRequests(false)}>
          {requests.length === 0 && <p className="muted">No pending requests.</p>}
          {requests.map((r) => (
            <div key={r.requestId} className="invite-row">
              <span className="friend-name">{r.fromUsername}</span>
              <button onClick={() => onAccept(r.requestId)}>Accept</button>
            </div>
          ))}
        </Modal>
      )}

      {statsOpen && (
        <Modal title="Your stats" onClose={onCloseStats}>
          <div className="stats-panel">
            {(!stats?.stats || stats.stats.length === 0) && <p className="muted">Play a match to start building your record.</p>}
            {stats?.stats?.length > 0 && (
              <div className="stats-grid">
                {stats.stats.map((row) => {
                  const game = availableGames.find((g) => g.id === row.gameId);
                  return (
                    <div key={row.gameId} className="stat-card">
                      <b>{game?.name || row.gameId}</b>
                      <span>{row.wins}W / {row.losses}L / {row.draws}D</span>
                      <small>{row.played} played{row.bestScore != null ? ` · best ${row.bestScore}` : ''}</small>
                    </div>
                  );
                })}
              </div>
            )}
            {stats?.recent?.length > 0 && (
              <div className="recent-matches">
                <span className="mode-label">Recent matches</span>
                {stats.recent.map((m) => (
                  <div key={m.id} className={`recent-row ${m.result}`}>
                    <span>{m.gameName}</span>
                    <b>{m.result}</b>
                    {m.score != null && <small>{m.score}</small>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
