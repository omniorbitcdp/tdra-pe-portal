import { GrievancePortal } from '@/components/GrievancePortal';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function RaiseGrievancePage() {
  const s = await getSettings();
  return <GrievancePortal initialTab="raise" slaHours={s.grievanceSlaHours} maxFileMb={s.maxGrievanceFileMb} />;
}
