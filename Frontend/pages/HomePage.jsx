import { NavLink } from 'react-router-dom';

const linkStyle = { display: 'inline-block', marginRight: 12, padding: '8px 12px', border: '1px solid #82000f', borderRadius: 8 };

      <h2 style={{ color: '#82000f' }}>Paneles</h2>
export default function HomePage() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginTop: 12 }}>
        <NavLink to="/diseno" style={linkStyle}>Diseño</NavLink>
        <NavLink to="/armado-primario" style={linkStyle}>Armado Primario</NavLink>
      </div>
    </div>
  );
}
