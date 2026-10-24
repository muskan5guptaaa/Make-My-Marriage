import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Lightbox, PhotoGrid, UploadButton } from '../../components/photos/PhotoParts.jsx';

// Photos on the guest page. The couple chooses per guest: no access, view, or view and add.
// Seeing them also needs the guest to sign in with the email on their invitation.
export default function PortalPhotos({ token, status }) {
  const { logout } = useAuth();
  const here = `/i/${token}`;

  if (!status || status.access === 'none') return null; // nothing shared with this guest

  let gate = null;
  if (!status.email) {
    gate = <p className="gp-muted">The couple has shared photos with you. Ask them to add your email to your invitation, then sign in here to see them.</p>;
  } else if (!status.signedIn && status.signedInAs) {
    gate = (
      <>
        <p className="gp-muted">
          You&rsquo;re signed in as <b>{status.signedInAs}</b>, but these photos are for <b>{status.email}</b>.
        </p>
        <button type="button" className="gp-link" onClick={logout}>Sign out and switch account</button>
      </>
    );
  } else if (!status.signedIn) {
    gate = (
      <>
        <p className="gp-muted">
          Sign in with <b>{status.email}</b> to {status.access === 'upload' ? 'see and share' : 'see'} the wedding photos. It only takes a minute.
        </p>
        <div className="gp-buttons">
          {status.hasAccount ? (
            <Link to="/signin" state={{ from: here, email: status.email }} className="gp-yes gp-btn-link">Sign in to see photos</Link>
          ) : (
            <Link to="/register" state={{ from: here, email: status.email }} className="gp-yes gp-btn-link">Create an account to see photos</Link>
          )}
        </div>
        {!status.hasAccount && (
          <p className="gp-hint">
            Already have one? <Link to="/signin" state={{ from: here, email: status.email }}>Sign in</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <section className="gp-photos" aria-labelledby="gp-photos-title">
      {gate ? (
        <div className="gp-card gp-locked">
          <h2 id="gp-photos-title" className="gp-fn">Wedding photos</h2>
          {gate}
        </div>
      ) : (
        <Albums token={token} canUpload={status.access === 'upload'} signedInAs={status.signedInAs} onSignOut={logout} />
      )}
    </section>
  );
}

function Albums({ token, canUpload, signedInAs, onSignOut }) {
  const [albums, setAlbums] = useState(null);
  const [current, setCurrent] = useState(null);
  const [photos, setPhotos] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const loadAlbums = useCallback(async () => {
    try {
      const { data } = await api.portalAlbums(token);
      setAlbums(data);
      setCurrent((c) => c ?? data[0]?._id ?? null);
    } catch (err) {
      setError(err.message);
      setAlbums([]);
    }
  }, [token]);

  const loadPhotos = useCallback(async () => {
    if (!current) return;
    try {
      setPhotos((await api.portalPhotos(token, current)).data);
    } catch (err) {
      setError(err.message);
      setPhotos([]);
    }
  }, [token, current]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);
  useEffect(() => {
    setPhotos(null);
    loadPhotos();
  }, [loadPhotos]);

  const album = albums?.find((a) => a._id === current);

  return (
    <>
      <div className="gp-photos-head">
        <h2 id="gp-photos-title" className="gp-section mono">Wedding photos</h2>
        {canUpload && album && (
          <UploadButton
            label="+ Add your photos"
            className="gp-upload"
            sign={() => api.portalSignPhoto(token, album._id)}
            complete={(photoId) => api.portalCompletePhoto(token, photoId)}
            onDone={() => Promise.all([loadPhotos(), loadAlbums()])}
          />
        )}
      </div>
      <p className="gp-signed mono">
        Signed in as {signedInAs} &middot; <button type="button" className="gp-link" onClick={onSignOut}>Sign out</button>
      </p>
      {error && <p className="gp-error" role="alert">{error}</p>}
      {albums === null ? (
        <p className="gp-muted">Loading photos…</p>
      ) : albums.length === 0 ? (
        <p className="gp-muted">No albums yet.</p>
      ) : (
        <>
          <div className="gp-album-chips" role="tablist" aria-label="Albums">
            {albums.map((a) => (
              <button key={a._id} type="button" role="tab" aria-selected={a._id === current} aria-pressed={a._id === current} onClick={() => setCurrent(a._id)}>
                {a.name} <span>{a.photoCount}</span>
              </button>
            ))}
          </div>
          {photos === null ? (
            <p className="gp-muted">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="gp-muted">No photos from {album?.name} yet.{canUpload && ' Be the first to share one!'}</p>
          ) : (
            <PhotoGrid photos={photos} onOpen={setOpen} />
          )}
        </>
      )}
      {open !== null && photos && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
