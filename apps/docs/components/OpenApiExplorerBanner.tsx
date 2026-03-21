import { Callout } from 'fumadocs-ui/components/callout';
import Link from 'next/link';

export default function OpenApiExplorerBanner() {
  return (
    <Callout type="info" title="Interactive API Explorer">
      Want to try these endpoints interactively? Check out the{' '}
      <Link href="https://api.open-mercato.dev">OpenAPI Explorer</Link>.
    </Callout>
  );
}
