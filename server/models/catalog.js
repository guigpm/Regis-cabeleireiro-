/** Public catalogs never expose commission, stock, accounts or private customer information. */
export function readCatalog(db, actor = null) {
  const barbers = db
    .prepare(
      `SELECT id,name,spec,photo,active,all_services${actor ? ',commission_bps' : ''} FROM barbers ${actor ? '' : 'WHERE active=1'} ORDER BY id`
    )
    .all()
    .filter((b) => !actor || actor.role === 'ROOT' || b.id === actor.barber_id)
    .map(({ all_services, ...barber }) => ({
      ...barber,
      allServices: Boolean(all_services),
      serviceIds: db
        .prepare('SELECT service_id FROM barber_services WHERE barber_id=?')
        .all(barber.id)
        .map((s) => s.service_id)
    }));
  return {
    services: db.prepare('SELECT id,name,price,duration FROM services WHERE active=1').all(),
    barbers,
    products: db
      .prepare(
        `SELECT id,name,price,category,image${actor ? ',stock' : ''} FROM products WHERE active=1`
      )
      .all(),
    hours: db.prepare('SELECT * FROM hours ORDER BY weekday').all(),
    whatsapp: db.prepare("SELECT value FROM settings WHERE key='whatsapp'").get().value
  };
}
