import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from './auth/guards.jsx';
import AppShell from './layout/AppShell.jsx';
import ComingSoon from './pages/ComingSoon.jsx';
import CreateWedding from './pages/CreateWedding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Expenses from './pages/expenses/Expenses.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Functions from './pages/Functions.jsx';
import Guests from './pages/guests/Guests.jsx';
import Home from './pages/home/Home.jsx';
import HomeRedirect from './pages/HomeRedirect.jsx';
import Invites from './pages/Invites.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Settings from './pages/Settings.jsx';
import SignIn from './pages/SignIn.jsx';
import Tasks from './pages/tasks/Tasks.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/register" element={<Register />} />
      </Route>
      {/* Reset links work whether or not someone is signed in. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/" element={<Home />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<HomeRedirect />} />
        <Route path="/weddings/new" element={<CreateWedding />} />
        <Route path="/invites" element={<Invites />} />
        <Route path="/w/:weddingId" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="functions" element={<Functions />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="guests" element={<Guests />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="gallery" element={<ComingSoon title="Gallery" text="One shared album per function for family and guests." />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
