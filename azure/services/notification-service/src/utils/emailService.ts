import * as nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private defaultFrom: string;

  constructor() {
    this.defaultFrom = process.env.EMAIL_FROM || 'noreply@eventix.com';
    
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    } else {
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const mailOptions = {
      from: message.from || this.defaultFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      if (this.transporter.transporter.name === 'json') {
        console.log('Email sent (JSON Transport):', JSON.stringify(info));
      }
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();
