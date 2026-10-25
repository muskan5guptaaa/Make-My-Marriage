import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { GuestOnly } from '../auth/guards.jsx';
import SignIn from '../pages/SignIn.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } };
});

const user = { _id: 'u1', name: 'Aisha Sharma', email: 'aisha@email.com' };
const signedOut = () => api.me.mockRejectedValueOnce(new ApiError(401, { code: 'unauthorized', message: 'Sign in to continue.' }));

function renderSignIn() {
  return render(
    <MemoryRouter initialEntries={['/signin']}>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/signin" element={<SignIn />} />
          </Route>
          <Route path="/app" element={<p>Planning home</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(email, password) {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('Email'), email);
  await u.type(screen.getByLabelText('Password'), password);
  await u.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Sign in', () => {
  it('signs in and goes to the app', async () => {
    signedOut();
    api.login.mockResolvedValue({ user });
    api.me.mockResolvedValue({ user, weddings: [], invites: [], guestOf: [] });

    renderSignIn();
    await fillAndSubmit('aisha@email.com', 'mehendi2026');

    expect(api.login).toHaveBeenCalledWith({ email: 'aisha@email.com', password: 'mehendi2026' });
    expect(await screen.findByText('Planning home')).toBeInTheDocument();
  });

  it('shows the server message for a wrong password and stays on Sign in', async () => {
    signedOut();
    api.login.mockRejectedValue(new ApiError(401, { code: 'unauthorized', message: 'Email or password is incorrect.' }));

    renderSignIn();
    await fillAndSubmit('aisha@email.com', 'wrong-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Planning home')).not.toBeInTheDocument();
  });

  it('shows field messages under the inputs', async () => {
    signedOut();
    api.login.mockRejectedValue(
      new ApiError(400, { code: 'invalid_input', message: 'Some fields need fixing.', fields: { email: 'Enter a valid email address.' } }),
    );

    renderSignIn();
    await fillAndSubmit('not-an-email', 'x');

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends someone already signed in straight to the app', async () => {
    api.me.mockResolvedValue({ user, weddings: [], invites: [], guestOf: [] });
    renderSignIn();
    expect(await screen.findByText('Planning home')).toBeInTheDocument();
  });
});
