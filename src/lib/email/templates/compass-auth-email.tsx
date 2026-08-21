import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";

type CompassAuthEmailProps = {
  url: string;
  expiresInMinutes: number;
};

// Compass-branded, minimal — one purpose, one action, no unnecessary
// technical detail (Section 6). Kept deliberately simple: no custom fonts,
// no multi-column layout, one template for both sign-up and sign-in since
// Auth.js's email provider doesn't distinguish the two before the link is
// clicked.
export function CompassAuthEmail({ url, expiresInMinutes }: CompassAuthEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your CompassFinance sign-in link</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>CompassFinance</Text>
          <Heading style={heading}>Sign in to CompassFinance</Heading>
          <Text style={paragraph}>
            Click the button below to securely sign in. This link is
            single-use and will expire in {expiresInMinutes} minutes.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={url}>
              Sign in to CompassFinance
            </Button>
          </Section>
          <Text style={paragraph}>
            If the button doesn&apos;t work, copy and paste this link into
            your browser:
          </Text>
          <Text style={linkText}>{url}</Text>
          <Hr style={hr} />
          <Text style={footer}>
            If you didn&apos;t request this email, you can safely ignore it —
            no account changes will be made. Never share this link with
            anyone; CompassFinance staff will never ask you for it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CompassAuthEmail;

const main = {
  backgroundColor: "#f6f7f9",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  borderRadius: "20px",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "420px",
  border: "1px solid #e7e9ee",
};

const brand = {
  color: "#7c3aed",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  textTransform: "uppercase" as const,
  margin: "0 0 16px",
};

const heading = {
  color: "#0e1116",
  fontSize: "22px",
  fontWeight: 700,
  margin: "0 0 12px",
};

const paragraph = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px",
};

const buttonSection = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#0e1116",
  borderRadius: "999px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "14px 0",
};

const linkText = {
  color: "#2563eb",
  fontSize: "12px",
  wordBreak: "break-all" as const,
  margin: "0 0 16px",
};

const hr = {
  borderColor: "#e7e9ee",
  margin: "24px 0",
};

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};
