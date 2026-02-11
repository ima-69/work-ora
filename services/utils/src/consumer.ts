import { Kafka } from "kafkajs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

export const startSendMailConsumer = async () => {
  try {
    const kafka = new Kafka({
      clientId: "mail-service",
      brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
    });

    const consumer = kafka.consumer({ groupId: "mail-service-group" });
    await consumer.connect();
    const topicName = "send-mail";
    await consumer.subscribe({ topic: topicName, fromBeginning: false });

    console.log(`✅ Mail service consumer started, listening for sending mail`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const { to, subject, html } = JSON.parse(
            message.value?.toString() || "{}",
          );

          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
              user: "xyz",
              pass: "yzx",
            },
          });

          await transporter.sendMail({
            from: '"Ora Team" <no-reply@ora.com>',
            to,
            subject,
            html,
          });

          console.log(`✅ Email has beensent to ${to}.`);

        } catch (error) {
            console.log(`❌ Failed to send email: ${error}`);
        }
      },
    });
  } catch (error) {
    console.log(`❌ Failed to start mail service consumer: ${error}`);
  }
};
