import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import { useApp } from './state/AppContext';
import Login from './pages/Login';
import Invite from './pages/Invite';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Commands from './pages/Commands';
import Automations from './pages/Automations';
import Timers from './pages/Timers';
import Obs from './pages/Obs';
import Giveaways from './pages/Giveaways';
import Polls from './pages/Polls';
import Queue from './pages/Queue';
import Soundboard from './pages/Soundboard';
import Buttons from './pages/Buttons';
import Stats from './pages/Stats';
import Team from './pages/Team';
import Settings from './pages/Settings';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-10 w-10 animate-pulse rounded-2xl"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
        />
        <p className="text-xs uppercase tracking-[0.3em] text-mist-500">STREAM COMMAND</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useApp();
  const location = useLocation();

  if (loading) return <Splash />;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/app" replace /> : <Login />} />
      <Route path="/convite/:token" element={user ? <Invite /> : <Login next={location.pathname} />} />
      <Route path="/app" element={user ? <AppLayout /> : <Navigate to="/" replace />}>
        <Route index element={<Dashboard />} />
        <Route path="chat" element={<Chat />} />
        <Route path="comandos" element={<Commands />} />
        <Route path="automacoes" element={<Automations />} />
        <Route path="timers" element={<Timers />} />
        <Route path="obs" element={<Obs />} />
        <Route path="sorteios" element={<Giveaways />} />
        <Route path="enquetes" element={<Polls />} />
        <Route path="fila" element={<Queue />} />
        <Route path="soundboard" element={<Soundboard />} />
        <Route path="botoes" element={<Buttons />} />
        <Route path="estatisticas" element={<Stats />} />
        <Route path="equipe" element={<Team />} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="configuracoes/:section" element={<Settings />} />
      </Route>
      <Route
        path="*"
        element={
          <div className="grid min-h-screen place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-semibold text-white">Página não encontrada</p>
              <p className="mt-1 text-xs text-mist-400">O endereço acessado não existe no STREAM COMMAND.</p>
              <a href="/app" className="btn-primary mt-4 inline-flex">
                Voltar ao dashboard
              </a>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
