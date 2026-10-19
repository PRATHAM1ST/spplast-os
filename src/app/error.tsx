'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty"><h2>We couldn’t open this view.</h2><p>Your locally saved entries are still on this device.</p><Button onClick={reset}>Try again</Button></div>; }
