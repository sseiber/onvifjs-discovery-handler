import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as onvif from 'onvif';
import * as fse from 'fs-extra';
import {
    resolve as pathResolve,
    dirname as pathDirname
} from 'path';
import {
    DISCOVERY_HANDLER_NAME,
    DEFAULT_DISCOVERY_HANDLER_SOCKET,
    DISCOVERY_HANDLER_SOCKET_NAME,
    IDiscoveryDetails,
    AGENT_REGISTRATION_SOCKET_NAME
} from './consts';
import { ProtoGrpcType } from '../proto/discovery';
import { RegisterDiscoveryHandlerRequest } from '../proto/v0/RegisterDiscoveryHandlerRequest';
import { RegistrationClient } from '../proto/v0/Registration';
import { DiscoverRequest } from '../proto/v0/DiscoverRequest';
import { DiscoverResponse } from '../proto/v0/DiscoverResponse';
import { DiscoveryHandlerHandlers } from '../proto/v0/DiscoveryHandler';
import { Device } from '../proto/v0/Device';
import { IAppConfig } from 'src';

export class OnvifJsDiscoveryHandler {
    private appConfig: IAppConfig;
    private client: RegistrationClient;
    private discoveryHandlerServer: DiscoveryHandlerHandlers;

    constructor(appConfig: IAppConfig) {
        this.appConfig = appConfig;
        this.discoveryHandlerServer = {
            Discover: this.akriDiscover.bind(this)
        };
    }

    public async init(): Promise<void> {
        this.appConfig.logger(['discoveryHandler', 'info'], `init`);

        try {
            await this.startHandler();

            await this.registerHandler();
        }
        catch (ex) {
            this.appConfig.logger(['discoveryHandler', 'error'], `error during init: ${ex.message}`);
        }
    }

    private async registerHandler(): Promise<void> {
        this.appConfig.logger(['discoveryHandler', 'info'], `registerHandler`);

        try {
            this.appConfig.logger(['discoveryHandler', 'info'], `loading discovery.proto...`);

            const protoPath = pathResolve(__dirname, '..', '..', 'proto', 'discovery.proto');
            const packageDefinition = protoLoader.loadSync(protoPath);
            const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;
            this.client = new proto.v0.Registration(`unix:${this.getAgentRegistrationSocket()}`, grpc.credentials.createInsecure());

            await new Promise((resolve, reject) => {
                this.appConfig.logger(['discoveryHandler', 'info'], `waiting for gRCP client connection...`);

                const deadline = new Date();
                this.client.waitForReady(deadline.setSeconds(deadline.getSeconds() + 5), (waitForReadyError?: Error) => {
                    if (waitForReadyError) {
                        this.appConfig.logger(['discoveryHandler', 'error'], `error waiting for registration client to connect: ${waitForReadyError.message}`);

                        return reject(waitForReadyError);
                    }

                    return resolve('');
                });
            });

            await new Promise((resolve, reject) => {
                this.appConfig.logger(['discoveryHandler', 'info'], `registering discoveryHandler`);

                const registerDiscoveryHandlerRequest: RegisterDiscoveryHandlerRequest = {
                    name: DISCOVERY_HANDLER_NAME,
                    endpoint: this.getDiscoveryHandlerSocket(),
                    endpointType: 'UDS',
                    shared: false
                };

                this.client.registerDiscoveryHandler(registerDiscoveryHandlerRequest, (registerHandlerError?: grpc.ServiceError | null) => {
                    if (registerHandlerError) {
                        this.appConfig.logger(['discoveryHandler', 'error'], `error during registerDiscoveryHandler: ${registerHandlerError.message}`);

                        return reject(registerHandlerError);
                    }

                    this.appConfig.logger(['discoveryHandler', 'info'], `registerDiscoveryHandler succeeded`);

                    return resolve('');
                });
            });
        }
        catch (ex) {
            this.appConfig.logger(['discoveryHandler', 'error'], `error during registerHandler: ${ex.message}`);
        }
    }

    private async startHandler(): Promise<void> {
        this.appConfig.logger(['discoveryHandler', 'info'], `startHandler`);

        const discoveryHandlerSocket = this.getDiscoveryHandlerSocket();

        try {
            this.appConfig.logger(['discoveryHandler', 'info'], `loading discovery.proto...`);

            const protoPath = pathResolve(__dirname, '..', '..', 'proto', 'discovery.proto');
            const packageDefinition = protoLoader.loadSync(protoPath);
            const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as ProtoGrpcType;

            const server = new grpc.Server();
            server.addService(proto.v0.DiscoveryHandler.service, this.discoveryHandlerServer);

            await new Promise((resolve, reject) => {
                this.appConfig.logger(['discoveryHandler', 'info'], `binding to service definition...`);

                try {
                    fse.ensureDirSync(pathDirname(discoveryHandlerSocket));
                    fse.removeSync(discoveryHandlerSocket);
                }
                catch (_ex) {
                    // do nothing
                }

                server.bindAsync(`unix:${discoveryHandlerSocket}`, grpc.ServerCredentials.createInsecure(), (serverBindError: Error | null, _port: number) => {
                    if (serverBindError) {
                        this.appConfig.logger(['discoveryHandler', 'error'], `server bind error: ${serverBindError.message}`);

                        return reject(serverBindError);
                    }

                    this.appConfig.logger(['discoveryHandler', 'info'], `server bound on socket: unix:${discoveryHandlerSocket}`);

                    server.start();

                    return resolve('');
                });
            });
        }
        catch (ex) {
            this.appConfig.logger(['discoveryHandler', 'error'], `error starting discoveryHandler: ${ex.message}`);
        }
    }

    private getAgentRegistrationSocket(): string {
        this.appConfig.logger(['discoveryHandler', 'info'], `getAgentRegistrationSocket`);

        let agentRegistrationSocket = '';

        try {
            agentRegistrationSocket = pathResolve(this.appConfig.agentDiscoveryHandlersSocketDirectory, AGENT_REGISTRATION_SOCKET_NAME);
        }
        catch (ex) {
            this.appConfig.logger(['discoveryHandler', 'error'], `error - bad agent registration UDP socket: ${ex.message}`);

            agentRegistrationSocket = '';
        }

        this.appConfig.logger(['discoveryHandler', 'info'], `returning agent registration socket path: ${agentRegistrationSocket}`);

        return agentRegistrationSocket;
    }

    private getDiscoveryHandlerSocket(): string {
        this.appConfig.logger(['discoveryHandler', 'info'], `getDiscoveryHandlerSocket`);

        let discoveryHandlerSocket: string;

        try {
            discoveryHandlerSocket = pathResolve(this.appConfig.agentDiscoveryHandlersSocketDirectory, DISCOVERY_HANDLER_SOCKET_NAME);
        }
        catch (_ex) {
            discoveryHandlerSocket = DEFAULT_DISCOVERY_HANDLER_SOCKET;
        }

        this.appConfig.logger(['discoveryHandler', 'info'], `returning discovery handler socket path: ${discoveryHandlerSocket}`);

        return discoveryHandlerSocket;
    }

    private parseDiscoveryDetails(requestDetails: string): IDiscoveryDetails {
        this.appConfig.logger(['discoveryHandler', 'info'], `parseDiscoveryDetails`);

        return {
            timeoutSeconds: 5
        };
    }

    private async akriDiscover(discoveryCall: grpc.ServerWritableStream<DiscoverRequest, DiscoverResponse>): Promise<void> {
        this.appConfig.logger(['discoveryHandler', 'info'], `akriDiscover`);

        discoveryCall.on('close', this.akriDiscoverClose.bind(this));

        discoveryCall.on('error', this.akriDiscoverError.bind(this));

        try {
            const discoveryDetails = this.parseDiscoveryDetails(discoveryCall.request.discoveryDetails);

            const devices = await this.discoverOnvifCameras(discoveryDetails) || [];

            await this.writeStreamData(discoveryCall, {
                devices
            });
        }
        catch (ex) {
            this.appConfig.logger(['discoveryHandler', 'error'], `error during onvif camera discovery: ${ex.message}`);
        }
    }

    private akriDiscoverClose(): void {
        this.appConfig.logger(['Discover stream', 'info'], `close`);

        // agent dropped the connection - need to re-register and start discovery again
    }

    private akriDiscoverError(error: Error): void {
        this.appConfig.logger(['Discover stream', 'error'], error.message);
    }

    private async discoverOnvifCameras(discoveryDetails: IDiscoveryDetails): Promise<Device[]> {
        let devices: Device[] = [];

        try {
            onvif.Discovery.on('device', (_cam, rinfo, _xml) => {
                this.appConfig.logger(['discoveryHandler', 'info'], '\n\ncam info...');

                this.appConfig.logger(['discoveryHandler', 'info'], 'rinfo...');
                this.appConfig.logger(['discoveryHandler', 'info'], JSON.stringify(rinfo, null, 4));
            });

            onvif.Discovery.on('error', (err, _xml) => {
                this.appConfig.logger(['discoveryHandler', 'info'], `Discovery error: ${err.message}`);
            });

            this.appConfig.logger(['discoveryHandler', 'info'], 'Starting camera discover...');
            devices = await new Promise((resolve, reject) => {
                onvif.Discovery.probe({
                    timeout: discoveryDetails.timeoutSeconds * 1000,
                    resolve: false
                }, (discoveryError, discoveryCameras) => {
                    if (discoveryError) {
                        return reject(discoveryError);
                    }

                    return resolve(discoveryCameras);
                });
            });
        }
        catch (ex) {
            this.appConfig.logger(['discoveryHandler', 'error'], `error during onvif network discovery: ${ex.message}`);
        }

        return devices;
    }

    private async writeStreamData(stream: grpc.ServerWritableStream<DiscoverRequest, DiscoverResponse>, data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            const cb = (err, res) => {
                if (err) {
                    return reject(err);
                }

                return resolve(res);
            };

            if (!stream.write(data)) {
                stream.once('drain', cb);
            }
            else {
                process.nextTick(cb);
            }
        });
    }
}
