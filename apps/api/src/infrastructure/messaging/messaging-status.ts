export type MessagingState = 'up' | 'down' | 'disabled';

/**
 * Read-only view of the RabbitMQ connection, for health checks. Kept separate
 * from RabbitMqPublisher so consumers don't load the AMQP client library.
 */
export abstract class MessagingStatus {
  abstract state(): MessagingState;
}
