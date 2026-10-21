import { GrievancePortal } from '@/components/GrievancePortal';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function TrackGrievancePage() {
  const s = await getSettings();
  return <GrievancePortal initialTab="track" slaHours={s.grievanceSlaHours} maxFileMb={s.maxGrievanceFileMb} />;
}
