import StageBoard from '../components/StageBoard';

export default function ArmadoPrimarioPage() {
  return (
    <StageBoard
      stages={[
        { key: 'armado_primario', label: 'Armado Primario' },
        { key: 'armado_piernas',  label: 'Armado Piernas' },
        { key: 'armado_hojas',    label: 'Armado Hojas' }
      ]}
    />
  );
}
