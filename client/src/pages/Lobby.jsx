// Main page: top bar, games grid (center), narrow chat (right).
// Clicking a game opens the invite/add-friend modal.
import { useEffect, useState } from 'react';
import { availableGames } from '../games/registry.js';
import { listMaps } from '../games/karts/kartMaps.js';
import { APP_NAME } from '../config.js';
import GameCard from '../components/GameCard.jsx';
import HeroBanner from '../components/HeroBanner.jsx';
import InviteModal from '../components/InviteModal.jsx';
import LobbyModal from '../components/LobbyModal.jsx';
import FriendsChat from '../components/FriendsChat.jsx';
import Modal from '../components/Modal.jsx';
import { setGameMuted } from '../gameAudio.js';
import { PROFILE_AVATARS, PROFILE_FRAMES, getUserSettings, saveUserSettings } from '../preferences.js';
import { pickFeaturedGame, recentGameIds } from '../homeRails.js';

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
  lobby,
  lobbyInvites,
  quickSearch,
  onCancelQuickSearch,
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
  onUpdateProfile,
  onShowStats,
  stats,
  statsOpen,
  onCloseStats,
  progression = null,
}) {
  const [pickedGame, setPickedGame] = useState(null); // game chosen to invite into
  const [showAdd, setShowAdd] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [settings, setSettings] = useState(getUserSettings);
  const [profileDraft, setProfileDraft] = useState({
    username: currentUser.username || '',
    displayName: currentUser.displayName || currentUser.username || '',
    nickname: currentUser.nickname || '',
    avatar: currentUser.avatar || 'pilot',
    frame: currentUser.frame || 'none',
  });
  // Level gates cosmetics; until progression data arrives, show everything
  // unlocked (the server still enforces).
  const playerLevel = progression?.level?.level ?? Infinity;
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [addName, setAddName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const unreadTotal = Object.values(unread || {}).reduce((sum, n) => sum + Number(n || 0), 0);
  const activeAvatar = PROFILE_AVATARS.find((a) => a.id === (currentUser.avatar || 'pilot')) || PROFILE_AVATARS[0];
  const profileName = currentUser.displayName || currentUser.username;
  const profileNickname = currentUser.nickname || '';

  // Clicking a game: multiplayer games open a lobby, 1v1 games open the invite modal.
  const pickGame = (g) => (g.maxPlayers > 2 ? onCreateLobby(g.id) : setPickedGame(g));

  // Home rails: hero features your most-played game (daily rotation before any
  // matches exist); "Continue playing" lists recently played games.
  const gameIds = availableGames.map((g) => g.id);
  const daySeed = Math.floor(Date.now() / 86400000);
  const featuredId = pickFeaturedGame(gameIds, stats?.stats, daySeed);
  const featured = availableGames.find((g) => g.id === featuredId) || null;
  const recentGames = recentGameIds(stats?.recent, gameIds)
    .filter((id) => id !== featuredId)
    .map((id) => availableGames.find((g) => g.id === id));

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

  useEffect(() => {
    if (!showProfile) return;
    setProfileDraft({
      username: currentUser.username || '',
      displayName: currentUser.displayName || currentUser.username || '',
      nickname: currentUser.nickname || '',
      avatar: currentUser.avatar || 'pilot',
      frame: currentUser.frame || 'none',
    });
    setProfileError('');
  }, [showProfile, currentUser]);

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

  const updateSettings = (patch) => {
    const next = saveUserSettings(patch);
    setSettings(next);
    if (Object.prototype.hasOwnProperty.call(patch, 'soundEffects')) {
      setGameMuted(!next.soundEffects);
    }
  };

  const updateProfileDraft = (patch) => {
    setProfileDraft((prev) => ({ ...prev, ...patch }));
    setProfileError('');
  };

  const submitProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      await onUpdateProfile({
        username: profileDraft.username,
        displayName: profileDraft.displayName,
        nickname: profileDraft.nickname,
        avatar: profileDraft.avatar,
        frame: profileDraft.frame,
      });
      setShowProfile(false);
    } catch (err) {
      setProfileError(err.message || 'Could not save profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const openMobileMenuAction = (action) => {
    setMobileMenuOpen(false);
    action();
  };

  const onShellTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    setTouchStart({ x: t.clientX, y: t.clientY });
  };

  const onShellTouchEnd = (e) => {
    if (!touchStart || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    setTouchStart(null);
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) setMobileChatOpen(true);
    else setMobileChatOpen(false);
  };

  return (
    <div className={`app${mobileChatOpen ? ' mobile-chat-open' : ''}`} onTouchStart={onShellTouchStart} onTouchEnd={onShellTouchEnd}>
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
        <button
          className="ghost topbar-menu-btn"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-controls="topbar-actions"
        >
          Menu
        </button>
        <div id="topbar-actions" className={`topbar-actions${mobileMenuOpen ? ' open' : ''}`}>
          <button className="ghost" onClick={() => { setShowJoinCode(true); setMobileMenuOpen(false); }}>
            Join code
          </button>
          <button className="ghost" onClick={() => { onShowRooms(); setMobileMenuOpen(false); }}>
            Open rooms
          </button>
          <button className="ghost" onClick={() => { setShowAdd(true); setMobileMenuOpen(false); }}>
            + Add friend
          </button>
          <button className="ghost requests-btn" onClick={() => { setShowRequests(true); setMobileMenuOpen(false); }}>
            Requests
            {requests.length > 0 && <span className="badge">{requests.length}</span>}
          </button>
          <button className="ghost" onClick={() => { onShowStats(); setMobileMenuOpen(false); }}>
            Stats
          </button>
          <button className="ghost" onClick={() => { setShowSettings(true); setMobileMenuOpen(false); }}>
            Settings
          </button>
          <button className="profile-chip ghost" onClick={() => { setShowProfile(true); setMobileMenuOpen(false); }}>
            <span className="profile-avatar">{activeAvatar.icon}</span>
            <span>{profileName}</span>
          </button>
        </div>
      </header>

      {quickSearch && (
        <div className="quick-search-status">
          <span>
            <b>Quick Play</b>
            Searching for {quickSearch.gameName || quickSearch.gameId} players
          </span>
          <button className="ghost" onClick={onCancelQuickSearch}>Cancel</button>
        </div>
      )}

      <div className="app-body" style={{ '--chat-w': `${chatWidth}px` }}>
        <main className="games-area">
          <HeroBanner
            game={featured}
            onPlay={pickGame}
            onQuickPlay={(game) => onQuickPlay(game)}
            searching={quickSearch?.gameId === featured?.id}
          />
          {recentGames.length > 0 && (
            <section className="home-rail">
              <h3 className="home-rail-title">Continue playing</h3>
              <div className="rail-scroll">
                {recentGames.map((g) => (
                  <GameCard
                    key={g.id}
                    game={g}
                    onClick={pickGame}
                    onQuickPlay={(game) => onQuickPlay(game)}
                    searching={quickSearch?.gameId === g.id}
                  />
                ))}
              </div>
            </section>
          )}
          <section className="home-rail">
            <h3 className="home-rail-title">All games</h3>
            <div className="games-grid">
              {availableGames.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  onClick={pickGame}
                  onQuickPlay={(game) => onQuickPlay(game)}
                  searching={quickSearch?.gameId === g.id}
                />
              ))}
            </div>
          </section>
        </main>

        <div
          className="resizer"
          onMouseDown={startResize}
          title="Drag to resize chat"
          role="separator"
          aria-orientation="vertical"
        />

        <aside className="chat-side">
          <button className="mobile-chat-close ghost" onClick={() => setMobileChatOpen(false)} aria-label="Close chat">
            ‹
          </button>
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

      <div className="mobile-bottom-actions">
        <button className="mobile-chat-fab mobile-action-icon" onClick={() => { setMobileMenuOpen(false); setMobileChatOpen(true); }} aria-label="Open chat">
          <span className="icon-chat" aria-hidden="true" />
          {unreadTotal > 0 && <b>{unreadTotal}</b>}
        </button>
        <button
          className="mobile-menu-fab mobile-action-icon"
          onClick={() => { setMobileChatOpen(false); setMobileMenuOpen((open) => !open); }}
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
        >
          <span className="icon-menu" aria-hidden="true" />
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-menu-sheet" role="dialog" aria-label="Menu">
          <button type="button" onClick={() => openMobileMenuAction(() => setShowJoinCode(true))} aria-label="Join by code">
            <span className="menu-action-icon icon-join" aria-hidden="true" />
            <span>Join</span>
          </button>
          <button type="button" onClick={() => openMobileMenuAction(onShowRooms)} aria-label="Open rooms">
            <span className="menu-action-icon icon-rooms" aria-hidden="true" />
            <span>Rooms</span>
          </button>
          <button type="button" onClick={() => openMobileMenuAction(() => setShowAdd(true))} aria-label="Add friend">
            <span className="menu-action-icon icon-add" aria-hidden="true" />
            <span>Add</span>
          </button>
          <button type="button" onClick={() => openMobileMenuAction(() => setShowRequests(true))} aria-label="Friend requests">
            <span className="menu-action-icon icon-requests" aria-hidden="true" />
            <span>Requests</span>
            {requests.length > 0 && <b>{requests.length}</b>}
          </button>
          <button type="button" onClick={() => openMobileMenuAction(onShowStats)} aria-label="Stats">
            <span className="menu-action-icon icon-stats" aria-hidden="true" />
            <span>Stats</span>
          </button>
          <button type="button" onClick={() => openMobileMenuAction(() => setShowSettings(true))} aria-label="Settings">
            <span className="menu-action-icon icon-settings" aria-hidden="true" />
            <span>Settings</span>
          </button>
          <button type="button" onClick={() => openMobileMenuAction(() => setShowProfile(true))} aria-label="Profile">
            <span className="menu-action-icon">{activeAvatar.icon}</span>
            <span>Profile</span>
          </button>
        </div>
      )}

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

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <div className="settings-panel">
            <section className="settings-group">
              <div>
                <b>Theme</b>
                <span>Change the platform look on this device.</span>
              </div>
              <div className="settings-options" role="group" aria-label="Theme">
                {[
                  ['default', 'Default'],
                  ['light', 'Light'],
                  ['arcade', 'Arcade'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`settings-choice${settings.theme === value ? ' active' : ''}`}
                    onClick={() => updateSettings({ theme: value })}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group">
              <div>
                <b>Controls</b>
                <span>Set the mobile Smash Karts throttle behavior.</span>
              </div>
              <div className="settings-options" role="group" aria-label="Mobile controls">
                {[
                  ['auto-gas', 'Auto gas'],
                  ['manual-gas', 'Manual gas'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`settings-choice${settings.mobileControls === value ? ' active' : ''}`}
                    onClick={() => updateSettings({ mobileControls: value })}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group settings-row">
              <div>
                <b>Sound effects</b>
                <span>Moves, timers, reactions, and Karts effects.</span>
              </div>
              <button
                type="button"
                className={`settings-toggle${settings.soundEffects ? ' active' : ''}`}
                onClick={() => updateSettings({ soundEffects: !settings.soundEffects })}
                aria-pressed={settings.soundEffects}
              >
                {settings.soundEffects ? 'On' : 'Off'}
              </button>
            </section>
          </div>
        </Modal>
      )}

      {showProfile && (
        <Modal title="Profile" onClose={() => setShowProfile(false)}>
          <form className="profile-panel" onSubmit={submitProfile}>
            <section className="profile-summary">
              <span className={`profile-avatar large frame-${profileDraft.frame}`}>
                {(PROFILE_AVATARS.find((a) => a.id === profileDraft.avatar) || activeAvatar).icon}
              </span>
              <div>
                <b>{profileDraft.displayName.trim() || currentUser.displayName || currentUser.username}</b>
                <span>{profileDraft.nickname.trim() || `@${profileDraft.username || currentUser.username}`}</span>
              </div>
            </section>

            <label className="profile-field">
              <span>Username</span>
              <input
                value={profileDraft.username}
                onChange={(e) => updateProfileDraft({ username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) })}
                placeholder={currentUser.username}
                maxLength={20}
              />
            </label>

            <label className="profile-field">
              <span>Display name</span>
              <input
                value={profileDraft.displayName}
                onChange={(e) => updateProfileDraft({ displayName: e.target.value.slice(0, 24) })}
                placeholder={currentUser.displayName || currentUser.username}
                maxLength={24}
              />
            </label>

            <label className="profile-field">
              <span>Nickname</span>
              <input
                value={profileDraft.nickname}
                onChange={(e) => updateProfileDraft({ nickname: e.target.value.slice(0, 24) })}
                placeholder={currentUser.username}
                maxLength={24}
              />
            </label>

            <section className="profile-avatar-section">
              <span>Avatar</span>
              <div className="profile-avatar-grid">
                {PROFILE_AVATARS.map((avatar) => {
                  const locked = avatar.minLevel > playerLevel;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      disabled={locked}
                      className={`profile-avatar-choice${profileDraft.avatar === avatar.id ? ' active' : ''}${locked ? ' locked' : ''}`}
                      onClick={() => updateProfileDraft({ avatar: avatar.id })}
                      aria-label={locked ? `${avatar.label} avatar unlocks at level ${avatar.minLevel}` : `Choose ${avatar.label} avatar`}
                      title={locked ? `Unlocks at level ${avatar.minLevel}` : avatar.label}
                    >
                      <span className="profile-avatar">{avatar.icon}</span>
                      <small>{avatar.label}</small>
                      {locked && <span className="lock-badge">Lv {avatar.minLevel}</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="profile-avatar-section">
              <span>Frame</span>
              <div className="profile-avatar-grid">
                {PROFILE_FRAMES.map((frame) => {
                  const locked = frame.minLevel > playerLevel;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      disabled={locked}
                      className={`profile-avatar-choice${profileDraft.frame === frame.id ? ' active' : ''}${locked ? ' locked' : ''}`}
                      onClick={() => updateProfileDraft({ frame: frame.id })}
                      aria-label={locked ? `${frame.label} frame unlocks at level ${frame.minLevel}` : `Choose ${frame.label} frame`}
                      title={locked ? `Unlocks at level ${frame.minLevel}` : frame.label}
                    >
                      <span className={`profile-avatar frame-${frame.id}`}>
                        {(PROFILE_AVATARS.find((a) => a.id === profileDraft.avatar) || activeAvatar).icon}
                      </span>
                      <small>{frame.label}</small>
                      {locked && <span className="lock-badge">Lv {frame.minLevel}</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            {profileError && <p className="profile-error">{profileError}</p>}

            <div className="profile-actions">
              <button type="submit" disabled={profileSaving}>
                {profileSaving ? 'Saving...' : 'Save profile'}
              </button>
              <button className="profile-logout ghost" onClick={onLogout} type="button">
                Log out
              </button>
            </div>
          </form>
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
