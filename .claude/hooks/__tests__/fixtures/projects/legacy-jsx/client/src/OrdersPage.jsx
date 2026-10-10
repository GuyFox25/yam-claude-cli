import React from 'react';

export class OrdersPage extends React.Component {
  state = { orders: [] };

  render() {
    return <ul>{this.state.orders.map((o) => <li key={o.id}>{o.name}</li>)}</ul>;
  }
}
