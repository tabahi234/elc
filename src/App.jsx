import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/authContext';
import Dashboard from './pages/Dashboard';
import Timetable from './pages/Timetable';
import Tasks from './pages/Tasks';
import Grades from './pages/Grades';
import Focus from './pages/Focus';
import Login from './pages/Login';
import BottomNav from './components/BottomNav';

function Shell() {
  const { user } = useAuth();

  if (user === undefined) {
    return <div className="login"><p className="text-muted">Loading…</p></div>;
  }
  if (!user) return <Login />;

  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/focus" element={<Focus />} />
        </Routes>
      </div>
      <BottomNav />
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
