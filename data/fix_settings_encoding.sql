INSERT INTO settings (`key`, value) VALUES ('site_name', 'Лента стальная — каталог металлопроката')
ON DUPLICATE KEY UPDATE value = 'Лента стальная — каталог металлопроката';

INSERT INTO settings (`key`, value) VALUES ('home_title', 'Лента стальная — каталог металлопроката')
ON DUPLICATE KEY UPDATE value = 'Лента стальная — каталог металлопроката';

INSERT INTO settings (`key`, value) VALUES ('home_h1', 'Каталог металлопроката')
ON DUPLICATE KEY UPDATE value = 'Каталог металлопроката';

INSERT INTO settings (`key`, value) VALUES ('home_meta_description', 'Нержавеющая и конструкционная лента по ГОСТ. Наличие на складе, резка в размер, доставка по России.')
ON DUPLICATE KEY UPDATE value = 'Нержавеющая и конструкционная лента по ГОСТ. Наличие на складе, резка в размер, доставка по России.';
