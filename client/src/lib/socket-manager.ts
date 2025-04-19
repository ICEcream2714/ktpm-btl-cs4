import { io, Socket } from "socket.io-client";
import { MarketDataItem } from "./api-adapter";

// Socket.io server URL
const SOCKET_SERVER_URL = "http://localhost:8080";

// Event names used by the socket server
export const SOCKET_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  CONNECT_ERROR: "connect_error",
  VALUE_UPDATE: "value_update",
  TYPE_UPDATE: "type_update",
  SUBSCRIBE: "subscribe",
};

// Interface for type update events
export interface TypeUpdateEvent {
  type: string;
  item?: MarketDataItem;
  items?: MarketDataItem[];
}

class SocketManager {
  private socket: Socket | null = null;
  private dataTypeSubscriptions: Map<
    string,
    Set<(data: MarketDataItem[], latestItem?: MarketDataItem) => void>
  > = new Map();
  private connectionStatus: "connected" | "disconnected" | "connecting" =
    "disconnected";
  private statusListeners: Set<(status: string) => void> = new Set();

  // Initialize the socket connection
  connect(): void {
    if (this.socket) return;

    console.log("Connecting to socket server...");
    this.updateStatus("connecting");

    this.socket = io(SOCKET_SERVER_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    // Set up event listeners
    this.socket.on(SOCKET_EVENTS.CONNECT, () => {
      console.log("Socket connected!");
      this.updateStatus("connected");
      this.resubscribeAll();
    });

    this.socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log("Socket disconnected");
      this.updateStatus("disconnected");
    });

    this.socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
      console.error("Socket connection error:", error);
      this.updateStatus("disconnected");
    });

    // Handle individual item updates (legacy mode)
    this.socket.on(SOCKET_EVENTS.VALUE_UPDATE, (dataString) => {
      try {
        const data = JSON.parse(dataString);
        // We don't need to process these in the new approach
        console.debug("Received legacy item update:", data);
      } catch (e) {
        console.error("Error parsing socket data:", e);
      }
    });

    // Handle data type updates (new approach)
    this.socket.on(SOCKET_EVENTS.TYPE_UPDATE, (dataString) => {
      try {
        const update: TypeUpdateEvent = JSON.parse(dataString);
        console.log(`Received type update for ${update.type}`, update);
        this.handleTypeUpdate(update);
      } catch (e) {
        console.error("Error parsing type update data:", e);
      }
    });
  }

  // Disconnect the socket
  disconnect(): void {
    if (!this.socket) return;

    console.log("Disconnecting socket and unsubscribing from all data types");

    // First, tell the server to unsubscribe us from all keys
    if (this.socket.connected) {
      this.socket.emit("unsubscribe_all");
    }

    // Remove all event listeners before disconnecting
    this.socket.off(SOCKET_EVENTS.CONNECT);
    this.socket.off(SOCKET_EVENTS.DISCONNECT);
    this.socket.off(SOCKET_EVENTS.CONNECT_ERROR);
    this.socket.off(SOCKET_EVENTS.VALUE_UPDATE);
    this.socket.off(SOCKET_EVENTS.TYPE_UPDATE);

    // Disconnect the socket
    this.socket.disconnect();

    // Clear all subscriptions
    this.dataTypeSubscriptions.clear();

    // Set socket to null to ensure we create a new one on reconnect
    this.socket = null;

    // Update status
    this.updateStatus("disconnected");
  }

  // Subscribe to updates for a specific market data type
  subscribeToDataType(
    dataType: string,
    callback: (data: MarketDataItem[], latestItem?: MarketDataItem) => void
  ): void {
    if (!this.socket) {
      this.connect();
    }

    // Store the subscription
    if (!this.dataTypeSubscriptions.has(dataType)) {
      this.dataTypeSubscriptions.set(dataType, new Set());

      // Only send the subscribe event if this is the first subscription for this type
      if (this.socket?.connected) {
        console.log(`Subscribing to market data type: ${dataType}`);
        this.socket.emit(SOCKET_EVENTS.SUBSCRIBE, dataType);
      }
    }

    this.dataTypeSubscriptions.get(dataType)?.add(callback);
  }

  // Unsubscribe from updates for a specific market data type
  unsubscribeFromDataType(
    dataType: string,
    callback: (data: MarketDataItem[], latestItem?: MarketDataItem) => void
  ): void {
    if (!this.dataTypeSubscriptions.has(dataType)) return;

    const callbacks = this.dataTypeSubscriptions.get(dataType);
    callbacks?.delete(callback);

    // If no more callbacks for this type, clean up
    if (callbacks?.size === 0) {
      this.dataTypeSubscriptions.delete(dataType);
    }
  }

  // Register a callback for connection status changes
  onStatusChange(callback: (status: string) => void): () => void {
    this.statusListeners.add(callback);

    // Immediately call with current status
    callback(this.connectionStatus);

    // Return a function to unregister the callback
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  // Get the current connection status
  getStatus(): string {
    return this.connectionStatus;
  }

  // Get a list of data types we're subscribed to
  getSubscribedDataTypes(): string[] {
    return Array.from(this.dataTypeSubscriptions.keys());
  }

  // Handle incoming type updates from the socket
  private handleTypeUpdate(update: TypeUpdateEvent): void {
    const { type, item, items } = update;

    if (!this.dataTypeSubscriptions.has(type)) {
      return; // No subscribers for this type
    }

    const callbacks = this.dataTypeSubscriptions.get(type);

    if (callbacks) {
      if (items) {
        // If we received multiple items (initial load)
        callbacks.forEach((callback) => {
          try {
            callback(items);
          } catch (e) {
            console.error("Error in socket update callback:", e);
          }
        });
      } else if (item) {
        // If we received a single item update
        callbacks.forEach((callback) => {
          try {
            callback([item], item);
          } catch (e) {
            console.error("Error in socket update callback:", e);
          }
        });
      }
    }
  }

  // Resubscribe to all previously subscribed types after reconnection
  private resubscribeAll(): void {
    if (!this.socket || !this.socket.connected) return;

    this.dataTypeSubscriptions.forEach((_, dataType) => {
      console.log(`Resubscribing to data type: ${dataType}`);
      this.socket?.emit(SOCKET_EVENTS.SUBSCRIBE, dataType);
    });
  }

  // Update the connection status and notify listeners
  private updateStatus(
    status: "connected" | "disconnected" | "connecting"
  ): void {
    this.connectionStatus = status;
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.error("Error in status change listener:", e);
      }
    });
  }
}

// Create a singleton instance
export const socketManager = new SocketManager();

export default socketManager;
