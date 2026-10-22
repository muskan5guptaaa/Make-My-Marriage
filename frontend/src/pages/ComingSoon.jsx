// Holds a sidebar link's place until that page is built.
export default function ComingSoon({ title, text }) {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
      </div>
      <section className="card hero-card">
        <div className="empty">
          <h2>Coming soon</h2>
          <p>{text}</p>
        </div>
      </section>
    </>
  );
}
