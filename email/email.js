let nodemailer = require("nodemailer");
let emailTransporter = nodemailer.createTransport({
    host: "host",
    port: 587,
    // secure: false, // upgrade later with STARTTLS
    auth: {
      user: "email",
      pass: "password",
    },
  });

async function sendEmail(toEmail, subject, body) {
    const message = {
        from: "email",
        to: toEmail,
        subject: subject,
        text: "Plaintext version of the message",
        html: body
    };
    try {
        await emailTransporter.sendMail(message);
    } catch (err) {
        console.log("Email error: ", err);
    }
}

module.exports = {
    sendEmail
}
