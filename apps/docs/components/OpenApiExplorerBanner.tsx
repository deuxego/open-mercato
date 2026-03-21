import { Callout } from 'fumadocs-ui/components/callout';

export default function OpenApiExplorerBanner() {
  return (
    <Callout type="info" title="Interactive API Explorer">
      Want to try these endpoints interactively? Check out the{' '}
      <a
        href="https://api.open-mercato.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        OpenAPI Explorer
      </a>
      .
    </Callout>
  );
}
