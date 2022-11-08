export const ENV_POD_IP_ADDRESS = 'POD_IP';
export const ENV_DISCOVERY_HANDLERS_DIRECTORY = 'DISCOVERY_HANDLERS_DIRECTORY';

export const AGENT_REGISTRATION_SOCKET_NAME = 'agent-registration.sock';

export const DISCOVERY_HANDLER_NAME = 'onvifjs';
export const DISCOVERY_HANDLER_PORT = 10000;
export const DEFAULT_DISCOVERY_HANDLER_SOCKET = `/var/lib/akri/${DISCOVERY_HANDLER_NAME}.sock`;
export const DISCOVERY_HANDLER_SOCKET_NAME = `${DISCOVERY_HANDLER_NAME}.sock`;

export interface IDiscoveryDetails {
    timeoutSeconds?: number;
    ipFilter?: 'Include' | 'include' | 'Exclude' | 'exclude';
    ipAddresses?: string[];
    macFilter?: 'Include' | 'include' | 'Exclude' | 'exclude';
    macAddresses?: string[];
}