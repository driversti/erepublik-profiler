import { getFlagUrl } from '../utils/formatters';

interface Props {
  name: string | null;
  size?: 'sm' | 'md';
}

function CountryFlag({ name, size = 'sm' }: Props) {
  const url = getFlagUrl(name);
  if (!url) return null;

  const cls = size === 'sm'
    ? 'w-5 h-3.5 object-cover rounded-sm flex-shrink-0'
    : 'w-7 h-5 object-cover rounded-sm flex-shrink-0';

  return <img src={url} alt={name ?? ''} className={cls} />;
}

export default CountryFlag;
