import Cashbook from '@/components/Cashbook';
import { requireRole } from '@/lib/auth-guard';
export default async function Page(){await requireRole('superadmin','/finance/cashbook');return <Cashbook scope="delivery"/>;}
