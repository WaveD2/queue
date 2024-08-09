export class RabbitMQError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RabbitMQError';
    }
}

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

export class ProducerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProducerError';
    }
}

export class ConsumerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConsumerError';
    }
}

export class RetryableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RetryableError';
    }
}